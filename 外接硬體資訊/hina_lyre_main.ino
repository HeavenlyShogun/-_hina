/*
 * Hina Lyre standalone ESP32 + VS1053B MIDI player
 *
 * SD song file: /song.txt (one monophonic event per CSV line)
 * Format: MIDI_NOTE,DURATION_MS,GAP_MS
 * Example:
 *   # note,duration_ms,gap_ms
 *   60,300,80
 *   62,300,80
 *   64,600,150
 * A note value of 0 may be used for a rest; durations/gaps are milliseconds.
 * Playback is started with PLAY and plays once. PAUSE or any note key stops
 * playback and sends MIDI All Notes Off before manual performance begins.
 *
 * Libraries: ESP32 Arduino core (SPI, SD), no third-party library required.
 * VS1053B RT-MIDI patch: official VLSI rtmidi12.zip, version 1.2,
 * VS1053B table from code/rtmidi1053b.c. This patch is chip/firmware specific.
 */

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <stdlib.h>

// Shared SPI bus
static constexpr int PIN_SPI_MOSI = 23;
static constexpr int PIN_SPI_MISO = 19;
static constexpr int PIN_SPI_SCK  = 18;

// VS1053B control pins; reset is tied to ESP32 EN as requested.
static constexpr int PIN_VS_XCS  = 5;   // SCI chip select
static constexpr int PIN_VS_XDCS = 16;  // SDI data chip select
static constexpr int PIN_VS_DREQ = 4;   // data request, active high
static constexpr int PIN_VS_RESET = -1; // hardware RESET -> ESP32 EN

// MicroSD chip select, on the same SPI bus.
static constexpr int PIN_SD_CS = 17;

// 4x6 matrix. Rows are outputs; columns are inputs with pull-ups.
// GPIO34/35/36 are input-only and are therefore used only as columns.
// Rows:    GPIO13, GPIO14, GPIO25, GPIO26
// Columns: GPIO27, GPIO32, GPIO33, GPIO34, GPIO35, GPIO36
static constexpr uint8_t ROW_PINS[4] = {13, 14, 25, 26};
static constexpr uint8_t COL_PINS[6] = {27, 32, 33, 34, 35, 36};
static constexpr uint8_t ROWS = 4;
static constexpr uint8_t COLS = 6;
static constexpr uint8_t KEY_COUNT = ROWS * COLS;
static constexpr uint32_t DEBOUNCE_MS = 25;

// Row-major key map: 21 natural notes C3-B5, then PLAY, PAUSE, unused.
// MIDI note numbers: C3,D3,E3,F3,G3,A3,B3, C4...B4, C5...B5.
static const int8_t KEY_MIDI[KEY_COUNT] = {
  48, 50, 52, 53, 55, 57,
  59, 60, 62, 64, 65, 67,
  69, 71, 72, 74, 76, 77,
  79, 81, 83, -1, -2, -3
};
static constexpr uint8_t PLAY_KEY_INDEX = 21;
static constexpr uint8_t PAUSE_KEY_INDEX = 22;

// VS1053 SCI registers and MIDI constants.
static constexpr uint8_t SCI_WRITE = 0x02;
static constexpr uint8_t SCI_READ = 0x03;
static constexpr uint8_t SCI_MODE = 0x00;
static constexpr uint8_t SCI_CLOCKF = 0x03;
static constexpr uint8_t SCI_WRAM = 0x06;
static constexpr uint8_t SCI_WRAMADDR = 0x07;
static constexpr uint8_t SCI_AIADDR = 0x0A;
static constexpr uint16_t SM_SDINEW = 0x0800;
static constexpr uint16_t SM_RESET = 0x0004;
static constexpr uint8_t MIDI_CHANNEL = 0; // MIDI Channel 0
static constexpr uint8_t MIDI_NOTE_OFF = 0x80;
static constexpr uint8_t MIDI_NOTE_ON = 0x90;
static constexpr uint8_t MIDI_CONTROL_CHANGE = 0xB0;
static constexpr uint8_t MIDI_PROGRAM_CHANGE = 0xC0;
static constexpr uint8_t MIDI_CC_ALL_NOTES_OFF = 123;

static SPISettings vsSciSettings(2000000, MSBFIRST, SPI_MODE0);
static SPISettings vsSdiSettings(8000000, MSBFIRST, SPI_MODE0);
static SPISettings sdSettings(4000000, MSBFIRST, SPI_MODE0);

struct DebouncedKey {
  bool rawPressed = false;
  bool stablePressed = false;
  uint32_t rawChangedAt = 0;
};
static DebouncedKey keys[KEY_COUNT];
static bool manualNoteActive[KEY_COUNT] = {false};

enum SongState : uint8_t { SONG_STOPPED, SONG_WAIT_EVENT, SONG_NOTE_ON, SONG_GAP };
static SongState songState = SONG_STOPPED;
static File songFile;
static char songLine[48];
static uint8_t songLineLength = 0;
static bool songLineOverflow = false;
static bool songEofHandled = false;
static bool songEventReady = false;
static uint8_t songEventNote = 0;
static uint32_t songEventDurationMs = 0;
static uint32_t songEventGapMs = 0;
static uint32_t songDeadline = 0;
static bool songVoiceActive = false;
static uint8_t songVoiceNote = 0;
static bool vsReady = false;
struct MidiMessage { uint8_t bytes[3]; uint8_t length; };
static constexpr uint8_t MIDI_QUEUE_CAPACITY = 48;
static MidiMessage midiQueue[MIDI_QUEUE_CAPACITY];
static uint8_t midiQueueHead = 0;
static uint8_t midiQueueTail = 0;
static uint8_t midiQueueCount = 0;

// The official VLSI table is embedded below as const data. See the note at EOF.
static const uint16_t VS1053B_RTMIDI_DTAB[1020] = {
  0x8050, 0x2800, 0x8080, 0x0006, 0x2016, 0xf400, 0x4095, 0x0006,
  0x0017, 0x3009, 0x1c40, 0x3009, 0x1fc2, 0x6020, 0x0024, 0x0000,
  0x1fc2, 0x2000, 0x0000, 0xb020, 0x4542, 0x3613, 0x0024, 0x0006,
  0x0057, 0x3e15, 0x1c15, 0x0020, 0x1fd4, 0x3580, 0x3802, 0xf204,
  0x3804, 0x0fff, 0xfe44, 0xa244, 0x1804, 0xf400, 0x4094, 0x2800,
  0x1985, 0x3009, 0x1bc2, 0xf400, 0x4500, 0x2000, 0x0000, 0x36f5,
  0x3c15, 0x3009, 0x3857, 0x2800, 0x1b40, 0x0030, 0x0457, 0x3009,
  0x3857, 0x0030, 0x0a57, 0x3e14, 0xf806, 0x3701, 0x8024, 0x0006,
  0x0017, 0x3e04, 0x9c13, 0x0020, 0x1fd2, 0x3b81, 0x8024, 0x36f4,
  0xbc13, 0x36f4, 0xd806, 0x0030, 0x0717, 0x2100, 0x0000, 0x3f05,
  0xdbd7, 0x0030, 0xf80f, 0x0000, 0x1f0e, 0x2800, 0x7680, 0x0000,
  0x004d, 0xf400, 0x4595, 0x3e00, 0x17cc, 0x3505, 0xf802, 0x3773,
  0x0024, 0x3763, 0x0024, 0x3700, 0x0024, 0x0000, 0x09c2, 0x6024,
  0x0024, 0x3600, 0x1802, 0x2830, 0xf855, 0x0000, 0x004d, 0x2800,
  0x2240, 0x36f3, 0x0024, 0x3613, 0x0024, 0x3e12, 0xb817, 0x3e12,
  0x3815, 0x3e05, 0xb814, 0x3625, 0x0024, 0x0000, 0x800a, 0x3e10,
  0x3801, 0x3e10, 0xb803, 0x3e11, 0x3810, 0x3e04, 0x7812, 0x34c3,
  0x0024, 0x3440, 0x0024, 0x4080, 0x0024, 0x001b, 0x3301, 0x2800,
  0x2c85, 0x0000, 0x0180, 0x0000, 0x0551, 0x0000, 0xaf02, 0x293c,
  0x1f40, 0x0007, 0xffc1, 0xb010, 0x134c, 0x0018, 0x0001, 0x4010,
  0x10d0, 0x0007, 0xffc1, 0xfe20, 0x020c, 0x0000, 0x0591, 0x48b6,
  0x0024, 0x4dd6, 0x0024, 0x0001, 0x2202, 0x293c, 0x1f40, 0x4380,
  0x2003, 0xb010, 0x134c, 0x0018, 0x0001, 0x4010, 0x1010, 0xfe20,
  0x020c, 0x48b6, 0x844c, 0x4dd6, 0x0024, 0xb880, 0x2003, 0x3434,
  0x0024, 0x2800, 0x5280, 0x3083, 0x0024, 0x001c, 0xccc2, 0x0000,
  0x05d1, 0x34d3, 0x0024, 0x3404, 0x0024, 0x3404, 0x420c, 0x3001,
  0x05cc, 0xa408, 0x044c, 0x3100, 0x0024, 0x6010, 0x0024, 0xfe20,
  0x0024, 0x48b6, 0x0024, 0x4dd6, 0x0024, 0x4310, 0x0024, 0x4488,
  0x2400, 0x0000, 0x0551, 0x2800, 0x3295, 0x3404, 0x0024, 0xf290,
  0x00cc, 0x3800, 0x0024, 0x3434, 0x0024, 0x3073, 0x0024, 0x3013,
  0x0024, 0x2800, 0x4340, 0x3800, 0x0024, 0x3083, 0x0024, 0x3000,
  0x0024, 0x6402, 0x0024, 0x0000, 0x1001, 0x2800, 0x3618, 0x0018,
  0x0002, 0x3434, 0x4024, 0x3133, 0x0024, 0x3100, 0x0024, 0xfe20,
  0x0024, 0x48b6, 0x0024, 0x4dd6, 0x0024, 0x2800, 0x4340, 0x3900,
  0xc024, 0x4010, 0x1011, 0x6402, 0x0024, 0x0000, 0x0590, 0x2800,
  0x3918, 0x0000, 0x0024, 0xf290, 0x04cc, 0x3900, 0x0024, 0x3434,
  0x0024, 0x3073, 0x0024, 0x3013, 0x0024, 0x2800, 0x4340, 0x3800,
  0x0024, 0x3183, 0x0024, 0x3100, 0x0024, 0x6402, 0x0024, 0x0000,
  0x1001, 0x2800, 0x3c98, 0x0019, 0x9982, 0x3434, 0x0024, 0x3033,
  0x0024, 0x3000, 0x0024, 0xfe20, 0x0024, 0x48b6, 0x0024, 0x4dd6,
  0x0024, 0x2800, 0x4340, 0x3800, 0xc024, 0x4010, 0x0024, 0x6402,
  0x0024, 0x001d, 0x7082, 0x2800, 0x4198, 0x0000, 0x0024, 0xf290,
  0x1010, 0x3033, 0x0024, 0x3800, 0x0024, 0x3404, 0x0024, 0x3073,
  0x0024, 0x3013, 0x0024, 0x3800, 0x0024, 0x0004, 0x4d50, 0x3010,
  0x0024, 0x30f0, 0x4024, 0x3434, 0x4024, 0x3143, 0x0024, 0x3910,
  0x0024, 0x2800, 0x4340, 0x39f0, 0x4024, 0x3434, 0x0024, 0x3033,
  0x0024, 0x3000, 0x0024, 0xfe20, 0x0024, 0x48b6, 0x0024, 0x4dd6,
  0x0024, 0x3800, 0xc024, 0x001e, 0x9982, 0x0001, 0x1012, 0x0000,
  0x0381, 0x34d3, 0x184c, 0x3444, 0x0024, 0x3073, 0x0024, 0x3013,
  0x0024, 0x3000, 0x0024, 0xfe20, 0x0024, 0x48b6, 0x0024, 0x4dd6,
  0x0024, 0x4380, 0x3003, 0x3400, 0x0024, 0x293d, 0x2900, 0x3e00,
  0x0024, 0x3009, 0x33c0, 0x293b, 0xc540, 0x0010, 0x0004, 0x34d3,
  0x184c, 0x3444, 0x0024, 0x3073, 0x13c0, 0x3073, 0x0024, 0x293b,
  0xf880, 0x0001, 0x1011, 0x0001, 0x0010, 0x0001, 0x1011, 0x34d3,
  0x184c, 0x3430, 0x0024, 0x4010, 0x0024, 0x0000, 0x05c1, 0x3e10,
  0x0024, 0x293b, 0xac80, 0x0006, 0x0092, 0x0000, 0x05d1, 0x36f3,
  0x134c, 0x3404, 0x0024, 0x3083, 0x0024, 0x3000, 0x0024, 0x6012,
  0x0024, 0x0013, 0x3304, 0x2800, 0x5198, 0x0001, 0xc682, 0x0000,
  0x0500, 0x0001, 0x0012, 0x3404, 0x584c, 0x3133, 0x0024, 0x3100,
  0x4024, 0x0000, 0x05d1, 0xfe22, 0x0024, 0x48b6, 0x0024, 0x4dd6,
  0x0024, 0x3e10, 0xc024, 0x3430, 0x8024, 0x4204, 0x0024, 0x293b,
  0xb580, 0x3e00, 0x8024, 0x36e3, 0x134c, 0x3434, 0x0024, 0x3083,
  0x0024, 0x3000, 0x0024, 0x6090, 0x0024, 0x3800, 0x1812, 0x36f4,
  0x4024, 0x36f1, 0x1810, 0x36f0, 0x9803, 0x36f0, 0x1801, 0x3405,
  0x9014, 0x36f3, 0x0024, 0x36f2, 0x1815, 0x2000, 0x0000, 0x36f2,
  0x9817, 0x3613, 0x0024, 0x3e12, 0xb817, 0x3e12, 0x3815, 0x3e05,
  0xb814, 0x3615, 0x0024, 0x0000, 0x800a, 0x3e10, 0x3801, 0x3e10,
  0xb804, 0x3e01, 0x7810, 0x0008, 0x04d0, 0x2900, 0x1480, 0x3001,
  0x0024, 0x4080, 0x03cc, 0x3000, 0x0024, 0x2800, 0x7485, 0x4090,
  0x0024, 0x0000, 0x0024, 0x2800, 0x6245, 0x0000, 0x0024, 0x0000,
  0x0081, 0x3000, 0x0024, 0x6012, 0x0024, 0x0000, 0x0401, 0x2800,
  0x70c5, 0x0000, 0x0024, 0x6012, 0x0024, 0x0000, 0x0024, 0x2800,
  0x6645, 0x0000, 0x0024, 0x2900, 0x1680, 0x0000, 0x0024, 0x4088,
  0x008c, 0x0000, 0x2000, 0x6400, 0x0024, 0x0000, 0x3c00, 0x2800,
  0x5ed8, 0x0000, 0x0024, 0x2800, 0x6300, 0x3801, 0x0024, 0x6400,
  0x038c, 0x0000, 0x0024, 0x2800, 0x6318, 0x0000, 0x0024, 0x3013,
  0x0024, 0x2900, 0x1480, 0x3801, 0x0024, 0x4080, 0x0024, 0x0000,
  0x0024, 0x2800, 0x6255, 0x0000, 0x0024, 0x6890, 0x03cc, 0x2800,
  0x7480, 0x3800, 0x0024, 0x2900, 0x1680, 0x0008, 0x0510, 0x3800,
  0x0024, 0x0000, 0x3c00, 0x6400, 0x0024, 0x003f, 0xff00, 0x2800,
  0x6b08, 0x0000, 0x0024, 0x0000, 0x3fc0, 0x6400, 0x0024, 0x0000,
  0x3c00, 0x2800, 0x73c5, 0x6400, 0x0024, 0x0000, 0x0024, 0x2800,
  0x73d5, 0x0000, 0x0024, 0xb880, 0x184c, 0x2900, 0x1480, 0x3009,
  0x3800, 0x4082, 0x9bc0, 0x6014, 0x0024, 0x0000, 0x3c04, 0x2800,
  0x6941, 0x0000, 0x3dc1, 0x2900, 0x1680, 0x0000, 0x0024, 0xf400,
  0x4004, 0x0000, 0x3dc1, 0x6412, 0x0024, 0x0008, 0x0490, 0x2800,
  0x6a85, 0x0000, 0x0000, 0x0000, 0x0400, 0x2800, 0x7480, 0x3800,
  0x0024, 0x0008, 0x04d0, 0x3001, 0x4024, 0xa50a, 0x0024, 0x0000,
  0x03c0, 0xb50a, 0x0024, 0x0000, 0x0300, 0x6500, 0x0024, 0x0000,
  0x0024, 0x2900, 0x1488, 0x0000, 0x6f48, 0x0000, 0x0380, 0x6500,
  0x0024, 0x0000, 0x0024, 0x2800, 0x7195, 0x0000, 0x0024, 0x2900,
  0x1480, 0x0000, 0x0024, 0x4080, 0x03cc, 0x0000, 0x0080, 0x2800,
  0x70d5, 0x0000, 0x0024, 0x2800, 0x7480, 0x3800, 0x0024, 0x2900,
  0x1680, 0x0000, 0x0024, 0x408a, 0x0024, 0x0008, 0x0510, 0x3613,
  0x0024, 0x3e11, 0x4024, 0x30f0, 0x0024, 0x3e10, 0x0024, 0x3000,
  0x4024, 0x2931, 0xe080, 0x3e00, 0x4024, 0x36d3, 0x0024, 0x0000,
  0x0000, 0x0008, 0x0490, 0x3800, 0x0024, 0x36f1, 0x5810, 0x36f0,
  0x9804, 0x36f0, 0x1801, 0x3405, 0x9014, 0x36f3, 0x0024, 0x36f2,
  0x1815, 0x2000, 0x0000, 0x36f2, 0x9817, 0x0005, 0xbe51, 0x0001,
  0x0010, 0x3613, 0x0024, 0x3e05, 0xb814, 0x3635, 0x0024, 0x0000,
  0x800a, 0xb880, 0x104c, 0xb882, 0x33c0, 0x2914, 0xbec0, 0x0004,
  0xc580, 0x0019, 0x98c0, 0x0004, 0x4e90, 0x3800, 0x0024, 0x001f,
  0xff00, 0x2931, 0x6c40, 0x3900, 0x0024, 0x2931, 0x6640, 0x0000,
  0x0024, 0x2900, 0x5500, 0x0000, 0x8001, 0x2912, 0x0d00, 0x3613,
  0x0024, 0x6012, 0x0024, 0x0000, 0x8005, 0x2800, 0x7b18, 0x0004,
  0x4d50, 0x2912, 0x0d00, 0x3613, 0x108c, 0x2934, 0x4180, 0x3ce0,
  0x0024, 0x0000, 0x1000, 0x3423, 0x0024, 0x2900, 0x0a80, 0x34e1,
  0x0024, 0xb882, 0x0042, 0x30f0, 0xc024, 0x4dc2, 0x0024, 0x3810,
  0x0024, 0x2800, 0x7b00, 0x38f0, 0x4024, 0x3e12, 0xb817, 0x3e12,
  0x3815, 0x3e05, 0xb814, 0x3615, 0x0024, 0x0000, 0x800a, 0x3e10,
  0x3801, 0x0000, 0x0081, 0xb880, 0xb811, 0x0030, 0x0291, 0x3e14,
  0x0024, 0x0030, 0x0690, 0x3e14, 0xb813, 0x0030, 0x00d3, 0x0007,
  0x9252, 0x3800, 0x0024, 0x3910, 0x0024, 0x3a00, 0x0024, 0x0000,
  0xc0c0, 0x3900, 0x0024, 0x0030, 0x0000, 0x0006, 0x0051, 0x2908,
  0x6400, 0x3b00, 0x0024, 0xb880, 0x008c, 0x3800, 0x0024, 0x3800,
  0x0024, 0x0003, 0x0d40, 0x0006, 0xc490, 0x2908, 0x7f80, 0x3009,
  0x2000, 0x0030, 0x0ad0, 0x3800, 0x184c, 0x002b, 0x1100, 0x3e10,
  0x0024, 0x2909, 0xa9c0, 0x3e10, 0x4024, 0x000a, 0x8001, 0x2908,
  0x7f80, 0x36e3, 0x0024, 0xb880, 0x2000, 0x0006, 0x0010, 0x3009,
  0x2410, 0x0006, 0x0011, 0x3009, 0x2410, 0x0008, 0x0490, 0x3810,
  0x0024, 0x3800, 0x0024, 0x0000, 0x0890, 0x290f, 0xfcc0, 0x0006,
  0x8380, 0x000a, 0x8001, 0x0000, 0x0950, 0x290f, 0xfcc0, 0x0006,
  0xb380, 0x0000, 0x09c0, 0x0030, 0x0690, 0x6890, 0x2000, 0x0030,
  0x1310, 0x6890, 0x2000, 0x0030, 0x0490, 0x2900, 0x1e00, 0x3800,
  0x0024, 0x36f4, 0x9813, 0x36f4, 0x1811, 0x36f0, 0x1801, 0x3405,
  0x9014, 0x36f3, 0x0024, 0x36f2, 0x1815, 0x2000, 0x0000, 0x36f2,
  0x9817, 0x5800, 0x1800, 0x1800, 0x98cc, 0x7395, 0x8025, 0x2a00,
  0x1ace, 0x8022, 0x2a00, 0x1a0e,
};

// ----------------------------- VS1053 SPI ---------------------------------

static void allSpiDevicesDeselect() {
  digitalWrite(PIN_VS_XCS, HIGH);
  digitalWrite(PIN_VS_XDCS, HIGH);
  digitalWrite(PIN_SD_CS, HIGH);
}

static bool waitForDreq(uint32_t timeoutMs);

static bool sciWrite(uint8_t address, uint16_t value) {
  if (!waitForDreq(1000)) return false;
  allSpiDevicesDeselect();
  SPI.beginTransaction(vsSciSettings);
  digitalWrite(PIN_VS_XCS, LOW);
  SPI.transfer(SCI_WRITE);
  SPI.transfer(address);
  SPI.transfer((uint8_t)(value >> 8));
  SPI.transfer((uint8_t)value);
  digitalWrite(PIN_VS_XCS, HIGH);
  SPI.endTransaction();
  return true;
}

static uint16_t sciRead(uint8_t address) {
  allSpiDevicesDeselect();
  SPI.beginTransaction(vsSciSettings);
  digitalWrite(PIN_VS_XCS, LOW);
  SPI.transfer(SCI_READ);
  SPI.transfer(address);
  uint16_t value = (uint16_t)SPI.transfer(0xFF) << 8;
  value |= SPI.transfer(0xFF);
  digitalWrite(PIN_VS_XCS, HIGH);
  SPI.endTransaction();
  return value;
}

static bool waitForDreq(uint32_t timeoutMs) {
  const uint32_t startedAt = millis();
  while (digitalRead(PIN_VS_DREQ) == LOW) {
    if ((uint32_t)(millis() - startedAt) >= timeoutMs) return false;
    yield();
  }
  return true;
}

static bool loadVs1053bRealtimeMidiPatch() {
  // VLSI's atab table is represented compactly: SCI_WRAMADDR once,
  // SCI_WRAM for 1008 words, then the final address/data runs.
  if (!sciWrite(SCI_WRAMADDR, VS1053B_RTMIDI_DTAB[0])) return false;
  for (uint16_t i = 1; i <= 1008; ++i) {
    if (!sciWrite(SCI_WRAM, VS1053B_RTMIDI_DTAB[i])) return false;
  }
  if (!sciWrite(SCI_WRAMADDR, VS1053B_RTMIDI_DTAB[1009])) return false;
  for (uint16_t i = 1010; i <= 1013; ++i) if (!sciWrite(SCI_WRAM, VS1053B_RTMIDI_DTAB[i])) return false;
  if (!sciWrite(SCI_WRAMADDR, VS1053B_RTMIDI_DTAB[1014])) return false;
  for (uint16_t i = 1015; i <= 1016; ++i) if (!sciWrite(SCI_WRAM, VS1053B_RTMIDI_DTAB[i])) return false;
  if (!sciWrite(SCI_WRAMADDR, VS1053B_RTMIDI_DTAB[1017])) return false;
  if (!sciWrite(SCI_WRAM, VS1053B_RTMIDI_DTAB[1018])) return false;
  if (!sciWrite(SCI_WRAM, VS1053B_RTMIDI_DTAB[1019])) return false;

  // Start the VS1053B-specific RT-MIDI application.
  if (!sciWrite(SCI_AIADDR, 0x0050)) return false;
  return waitForDreq(1500);
}

static bool queueMidiMessage(const uint8_t *bytes, uint8_t length) {
  if (!vsReady || length == 0 || length > 3 || midiQueueCount >= MIDI_QUEUE_CAPACITY) return false;
  MidiMessage &message = midiQueue[midiQueueTail];
  message.length = length;
  for (uint8_t i = 0; i < length; ++i) message.bytes[i] = bytes[i];
  midiQueueTail = (midiQueueTail + 1) % MIDI_QUEUE_CAPACITY;
  ++midiQueueCount;
  return true;
}

static void sendMidi3(uint8_t status, uint8_t data1, uint8_t data2) {
  const uint8_t bytes[3] = {status, data1, data2};
  queueMidiMessage(bytes, 3);
}

static void sendProgramChange(uint8_t program) {
  if (!vsReady) return;
  const uint8_t bytes[2] = {(uint8_t)(MIDI_PROGRAM_CHANGE | MIDI_CHANNEL), program};
  queueMidiMessage(bytes, 2);
}

static void serviceMidiTx() {
  // Runtime transmission is non-blocking: only send a complete MIDI message
  // when DREQ is already high. Prefix each SDI MIDI byte with 0x00 per VLSI.
  if (!vsReady || midiQueueCount == 0 || digitalRead(PIN_VS_DREQ) == LOW) return;
  const MidiMessage &message = midiQueue[midiQueueHead];
  allSpiDevicesDeselect();
  SPI.beginTransaction(vsSdiSettings);
  digitalWrite(PIN_VS_XDCS, LOW);
  for (uint8_t i = 0; i < message.length; ++i) {
    SPI.transfer(0x00);
    SPI.transfer(message.bytes[i]);
  }
  digitalWrite(PIN_VS_XDCS, HIGH);
  SPI.endTransaction();
  midiQueueHead = (midiQueueHead + 1) % MIDI_QUEUE_CAPACITY;
  --midiQueueCount;
}

static void sendNoteOn(uint8_t note, uint8_t velocity = 100) {
  sendMidi3(MIDI_NOTE_ON | MIDI_CHANNEL, note, velocity);
}

static void sendNoteOff(uint8_t note) {
  sendMidi3(MIDI_NOTE_OFF | MIDI_CHANNEL, note, 0);
}

static void sendAllNotesOff() {
  // Drop unsent events and put the panic message at the head of the queue.
  midiQueueHead = midiQueueTail = midiQueueCount = 0;
  sendMidi3(MIDI_CONTROL_CHANGE | MIDI_CHANNEL, MIDI_CC_ALL_NOTES_OFF, 0);
  for (uint8_t i = 0; i < KEY_COUNT; ++i) manualNoteActive[i] = false;
  songVoiceActive = false;
}

// ------------------------------- Songs ------------------------------------

static bool isSupportedNaturalNote(long note) {
  for (uint8_t i = 0; i < 21; ++i) {
    if (KEY_MIDI[i] == note) return true;
  }
  return false;
}

static void stopSong(bool sendPanic) {
  if (songFile) songFile.close();
  songState = SONG_STOPPED;
  songLineLength = 0;
  songLineOverflow = false;
  songEofHandled = false;
  songEventReady = false;
  songVoiceActive = false;
  if (sendPanic) sendAllNotesOff();
}

// Open and initialize an SD CSV song without blocking for its playback.
static bool playSongFromSD(const char *filename) {
  stopSong(true);
  songFile = SD.open(filename, FILE_READ);
  if (!songFile) {
    Serial.printf("Cannot open song: %s\n", filename);
    return false;
  }
  songState = SONG_WAIT_EVENT;
  songDeadline = millis();
  songLineLength = 0;
  songLineOverflow = false;
  songEofHandled = false;
  songEventReady = false;
  Serial.printf("Playing once: %s\n", filename);
  return true;
}

static bool parseSongLine(char *line) {
  // Ignore whitespace-only and comment lines.
  char *cursor = line;
  while (*cursor == ' ' || *cursor == '\t') ++cursor;
  if (*cursor == '\0' || *cursor == '\r' || *cursor == '#') return false;

  char *end = nullptr;
  long note = strtol(cursor, &end, 10);
  if (end == cursor || *end != ',') return false;
  cursor = end + 1;
  long duration = strtol(cursor, &end, 10);
  if (end == cursor || *end != ',') return false;
  cursor = end + 1;
  long gap = strtol(cursor, &end, 10);
  if (end == cursor) return false;
  while (*end == ' ' || *end == '\t' || *end == '\r') ++end;
  if (*end != '\0') return false;
  if (note != 0 && !isSupportedNaturalNote(note)) return false;
  if (duration < 1 || duration > 60000 || gap < 0 || gap > 60000) return false;

  songEventNote = (uint8_t)note;
  songEventDurationMs = (uint32_t)duration;
  songEventGapMs = (uint32_t)gap;
  return true;
}

static void readSongInputIncrementally() {
  if (!songFile || songEventReady || songEofHandled) return;
  if (songFile.available()) {
    const int value = songFile.read();
    if (value == '\n') {
      songLine[songLineLength] = '\0';
      if (!songLineOverflow && parseSongLine(songLine)) songEventReady = true;
      songLineLength = 0;
      songLineOverflow = false;
    } else if (value >= 0 && value != '\r') {
      if (songLineLength < sizeof(songLine) - 1) songLine[songLineLength++] = (char)value;
      else songLineOverflow = true;
    }
    return; // at most one SD byte per loop iteration
  }

  if (!songFile.available() && songFile) {
    if (songLineLength > 0 && !songLineOverflow) {
      songLine[songLineLength] = '\0';
      songLineLength = 0;
      if (parseSongLine(songLine)) {
        songEventReady = true;
        return;
      }
    }
    songEofHandled = true;
  }
}

static void updateSongPlayback(uint32_t now) {
  if (songState == SONG_STOPPED) return;
  readSongInputIncrementally();

  if (songState == SONG_NOTE_ON && (int32_t)(now - songDeadline) >= 0) {
    if (songVoiceActive) sendNoteOff(songVoiceNote);
    songVoiceActive = false;
    songState = SONG_GAP;
    songDeadline = now + songEventGapMs;
  }

  if (songState == SONG_GAP && (int32_t)(now - songDeadline) >= 0) {
    songState = SONG_WAIT_EVENT;
  }

  if (songState == SONG_WAIT_EVENT && (int32_t)(now - songDeadline) >= 0) {
    if (songEventReady) {
      songEventReady = false;
      if (songEventNote != 0) {
        sendNoteOn(songEventNote);
        songVoiceNote = songEventNote;
        songVoiceActive = true;
      }
      songState = SONG_NOTE_ON;
      songDeadline = now + songEventDurationMs;
    } else if (songEofHandled) {
      Serial.println("Song finished.");
      stopSong(false);
    }
  }
}

// ----------------------------- Matrix input -------------------------------

static void handleKeyPressed(uint8_t index) {
  if (index == PLAY_KEY_INDEX) {
    playSongFromSD("/song.txt");
    return;
  }
  if (index == PAUSE_KEY_INDEX) {
    if (songState != SONG_STOPPED) Serial.println("Playback paused/stopped.");
    stopSong(true);
    return;
  }

  const int8_t note = KEY_MIDI[index];
  if (note < 0) return; // unused matrix cell

  if (songState != SONG_STOPPED) {
    Serial.println("Manual key interrupts song.");
    stopSong(true); // sends CC123 before the manual Note On
  }
  if (!manualNoteActive[index]) {
    sendNoteOn((uint8_t)note);
    manualNoteActive[index] = true;
  }
}

static void handleKeyReleased(uint8_t index) {
  if (index >= 21 || !manualNoteActive[index]) return;
  sendNoteOff((uint8_t)KEY_MIDI[index]);
  manualNoteActive[index] = false;
}

static void scanMatrix(uint32_t now) {
  for (uint8_t row = 0; row < ROWS; ++row) {
    // Unscanned rows are high-impedance to avoid output contention. Add a
    // diode per switch to prevent ghosting when several keys are held.
    for (uint8_t r = 0; r < ROWS; ++r) pinMode(ROW_PINS[r], INPUT);
    digitalWrite(ROW_PINS[row], LOW);
    pinMode(ROW_PINS[row], OUTPUT);
    yield();

    for (uint8_t col = 0; col < COLS; ++col) {
      const uint8_t index = row * COLS + col;
      const bool pressed = digitalRead(COL_PINS[col]) == LOW;
      if (pressed != keys[index].rawPressed) {
        keys[index].rawPressed = pressed;
        keys[index].rawChangedAt = now;
      }
      if (keys[index].stablePressed != keys[index].rawPressed &&
          (uint32_t)(now - keys[index].rawChangedAt) >= DEBOUNCE_MS) {
        keys[index].stablePressed = keys[index].rawPressed;
        if (keys[index].stablePressed) handleKeyPressed(index);
        else handleKeyReleased(index);
      }
    }
  }
  for (uint8_t r = 0; r < ROWS; ++r) pinMode(ROW_PINS[r], INPUT);
}

// -------------------------------- Setup ------------------------------------

void setup() {
  Serial.begin(115200);
  pinMode(PIN_VS_XCS, OUTPUT);
  pinMode(PIN_VS_XDCS, OUTPUT);
  pinMode(PIN_SD_CS, OUTPUT);
  pinMode(PIN_VS_DREQ, INPUT);
  allSpiDevicesDeselect();

  for (uint8_t row = 0; row < ROWS; ++row) pinMode(ROW_PINS[row], INPUT);
  for (uint8_t col = 0; col < COLS; ++col) {
    // GPIO34/35/36 lack internal pull resistors: fit external 10k pull-ups.
    const bool inputOnly = COL_PINS[col] >= 34;
    pinMode(COL_PINS[col], inputOnly ? INPUT : INPUT_PULLUP);
  }

  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);

  // Boot-time device initialization only. Runtime song and keypad logic is non-blocking.
  if (!SD.begin(PIN_SD_CS, SPI, 4000000)) {
    Serial.println("MicroSD initialization failed.");
  } else {
    Serial.println("MicroSD ready.");
  }

  if (!waitForDreq(2000)) {
    Serial.println("VS1053 DREQ timeout; check power/wiring.");
    return;
  }
  // Software reset leaves the chip ready for a freshly loaded application patch.
  if (!sciWrite(SCI_MODE, SM_SDINEW | SM_RESET)) {
    Serial.println("VS1053 SCI write timeout.");
    return;
  }
  if (!waitForDreq(2000)) {
    Serial.println("VS1053 reset timeout.");
    return;
  }
  if (!sciWrite(SCI_CLOCKF, 0xC000)) {
    Serial.println("VS1053 clock setup timeout.");
    return;
  }
  if (!loadVs1053bRealtimeMidiPatch()) {
    Serial.println("VS1053 RT-MIDI patch load failed.");
    return;
  }
  vsReady = true;
  sendProgramChange(0); // Program 0: Acoustic Grand Piano
  sendMidi3(MIDI_CONTROL_CHANGE | MIDI_CHANNEL, 7, 110); // channel volume
  Serial.println("Hina Lyre ready. Press PLAY to play /song.txt once.");
}

void loop() {
  const uint32_t now = millis();
  scanMatrix(now);
  updateSongPlayback(now);
  serviceMidiTx();
  yield();
}

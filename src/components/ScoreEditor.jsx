import React, { memo } from 'react';
import SheetDisplay from './SheetDisplay';

const ScoreEditor = memo((props) => (
  <SheetDisplay {...props} />
));

export default ScoreEditor;

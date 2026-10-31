// Regression trend deviation inputs (OpenCandle 0.8.1), shared by the drawing model and its alert geometry. Pure data rules.
export const REGRESSION_DEFAULT_DEVIATION=2;
/** A stored deviation input (props.upperDeviation / lowerDeviation): a finite number 0..50, else the default 2. */
export const regressionDeviation=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=50?value:REGRESSION_DEFAULT_DEVIATION;

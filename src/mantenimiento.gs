function corregirVariacionWallStreet() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('WS_CORREGIDO')) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Wall_Street_Top_Historico');
  const n = sh.getLastRow() - 1;
  const rango = sh.getRange(2, 5, n, 1);
  rango.setValues(rango.getValues().map(([v]) => [v / 100]));
  props.setProperty('WS_CORREGIDO', '1');
}
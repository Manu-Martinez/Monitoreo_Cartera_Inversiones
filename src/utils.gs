function fetchConReintentos(url, maxIntentos) {
  maxIntentos = maxIntentos || 3;
  let ultimoError;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (response.getResponseCode() === 200) {
        return JSON.parse(response.getContentText());
      }
      ultimoError = 'HTTP ' + response.getResponseCode();
    } catch (e) {
      ultimoError = e.message;
    }
    if (intento < maxIntentos) {
      Utilities.sleep(2000 * intento);
    }
  }
  throw new Error('Fallo tras ' + maxIntentos + ' intentos (' + url + '): ' + ultimoError);
}

function esArrayValido(data) {
  return Array.isArray(data) && data.length > 0;
}
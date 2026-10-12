function actualizarPreciosCartera() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const manual = ss.getSheetByName('Mi_Portafolio_Manual');
  const historico = ss.getSheetByName('Mi_Portafolio_Historico');
  const log = ss.getSheetByName('_pipeline_log');
  const detalleErrores = ss.getSheetByName('_detalle_errores');
  const fecha_hora = new Date();

  try {
    const filas = manual.getDataRange().getValues().slice(1);

    const fuentes = {
      cedear: 'https://data912.com/live/arg_cedears',
      accion_local_ar: 'https://data912.com/live/arg_stocks',
      accion_usa_adr: 'https://data912.com/live/usa_adrs',
      accion_usa_stock: 'https://data912.com/live/usa_stocks',
      bono: 'https://data912.com/live/arg_bonds'
    };

    const datasets = {};
    for (const key in fuentes) {
      const data = fetchConReintentos(fuentes[key]);
      if (!esArrayValido(data)) {
        detalleErrores.appendRow([fecha_hora, 'actualizarPreciosCartera', '-', 'estructura_inesperada', 'Respuesta inválida de ' + fuentes[key]]);
        throw new Error('Estructura inesperada en ' + key);
      }
      datasets[key] = data;
    }

    const accionesUsa = datasets.accion_usa_adr.concat(datasets.accion_usa_stock);

    let filasProcesadas = 0;
    let filasConError = 0;

    filas.forEach(fila => {
      const [simbolo, cantidad, tipo_instrumento] = fila;
      let dataset, moneda;

      if (tipo_instrumento === 'cedear') { dataset = datasets.cedear; moneda = 'ARS'; }
      else if (tipo_instrumento === 'accion_local_ar') { dataset = datasets.accion_local_ar; moneda = 'ARS'; }
      else if (tipo_instrumento === 'accion_usa') { dataset = accionesUsa; moneda = 'USD'; }
      else if (tipo_instrumento === 'bono') { dataset = datasets.bono; moneda = 'ARS'; }

      const match = dataset.find(item => item.symbol === simbolo);

      if (!match) {
        detalleErrores.appendRow([fecha_hora, 'actualizarPreciosCartera', simbolo, 'sin_match', 'No encontrado en la fuente correspondiente']);
        filasConError++;
        return;
      }
      if (!match.c || match.c <= 0) {
        detalleErrores.appendRow([fecha_hora, 'actualizarPreciosCartera', simbolo, 'precio_invalido', 'Precio recibido: ' + match.c]);
        filasConError++;
        return;
      }

      const precio_actual = match.c;
      const valorizado = cantidad * precio_actual;
      historico.appendRow([fecha_hora, simbolo, tipo_instrumento, cantidad, precio_actual, moneda, valorizado]);
      filasProcesadas++;
    });

    log.appendRow([fecha_hora, 'actualizarPreciosCartera', 'data912', filasProcesadas, filasConError > 0 ? 'OK_CON_ERRORES' : 'OK', filasConError + ' filas con error']);

  } catch (e) {
    log.appendRow([fecha_hora, 'actualizarPreciosCartera', 'data912', 0, 'ERROR', e.message]);
    detalleErrores.appendRow([fecha_hora, 'actualizarPreciosCartera', '-', 'fetch_fallido', e.message]);
  }
  
}



function actualizarTopInversiones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historico = ss.getSheetByName('Wall_Street_Top_Historico');
  const log = ss.getSheetByName('_pipeline_log');
  const detalleErrores = ss.getSheetByName('_detalle_errores');
  const fecha_hora = new Date();
  const apiKey = PropertiesService.getScriptProperties().getProperty('FMP_API_KEY');

  try {
    const endpoints = {
      gainer: 'https://financialmodelingprep.com/stable/biggest-gainers?apikey=' + apiKey,
      loser: 'https://financialmodelingprep.com/stable/biggest-losers?apikey=' + apiKey,
      active: 'https://financialmodelingprep.com/stable/most-actives?apikey=' + apiKey
    };

    const categorias = [];

    for (const nombre in endpoints) {
      const data = fetchConReintentos(endpoints[nombre]);
      if (!esArrayValido(data)) {
        detalleErrores.appendRow([fecha_hora, 'actualizarTopInversiones', '-', 'estructura_inesperada', 'Respuesta inválida de FMP (' + nombre + ')']);
        throw new Error('Estructura inesperada en ' + nombre);
      }
      categorias.push({ nombre: nombre, datos: data.slice(0, 10) });
    }

    let filasProcesadas = 0;
    let filasConError = 0;

    categorias.forEach(cat => {
      cat.datos.forEach(item => {
        const simbolo = item.symbol;
        const precio = item.price;
        const variacion_pct = item.changesPercentage !== undefined ? item.changesPercentage / 100 : undefined;

        

        if (!simbolo) {
          detalleErrores.appendRow([fecha_hora, 'actualizarTopInversiones', '(sin símbolo)', 'estructura_inesperada', 'Item sin campo symbol en ' + cat.nombre]);
          filasConError++;
          return;
        }
        if (precio === undefined || precio <= 0) {
          detalleErrores.appendRow([fecha_hora, 'actualizarTopInversiones', simbolo, 'precio_invalido', 'Precio recibido: ' + precio]);
          filasConError++;
          return;
        }
        if (variacion_pct === undefined) {
          detalleErrores.appendRow([fecha_hora, 'actualizarTopInversiones', simbolo, 'estructura_inesperada', 'Sin campo changesPercentage']);
          filasConError++;
          return;
        }

        historico.appendRow([fecha_hora, cat.nombre, simbolo, precio, variacion_pct]);
        filasProcesadas++;
      });
    });

    log.appendRow([fecha_hora, 'actualizarTopInversiones', 'fmp', filasProcesadas, filasConError > 0 ? 'OK_CON_ERRORES' : 'OK', filasConError + ' items con error']);

  } catch (e) {
    log.appendRow([fecha_hora, 'actualizarTopInversiones', 'fmp', 0, 'ERROR', e.message]);
  detalleErrores.appendRow([fecha_hora, 'actualizarTopInversiones', '-', 'fetch_fallido', e.message]);
  }
}

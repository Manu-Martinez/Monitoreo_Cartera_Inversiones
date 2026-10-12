

function generarSeñales() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historico = ss.getSheetByName('Mi_Portafolio_Historico');
  const reglasSheet = ss.getSheetByName('Reglas_Señales');
  const señalesSheet = ss.getSheetByName('Señales_Portafolio');
  const log = ss.getSheetByName('_pipeline_log');
  const detalleErrores = ss.getSheetByName('_detalle_errores');
  const fecha_hora = new Date();
  const DIA_MS = 24 * 60 * 60 * 1000;

  try {
    // Reglas por perfil (los umbrales están como número simple: -5 = -5%)
    const reglas = {};
    reglasSheet.getDataRange().getValues().slice(1).forEach(([perfil, ventana, compra, venta]) => {
      reglas[perfil] = { ventana: Number(ventana), compra: Number(compra) / 100, venta: Number(venta) / 100 };
    })
     if (Object.keys(reglas).length === 0) { 
      throw new Error('Reglas_Señales está vacía: cargá los perfiles antes de correr');}
    ;
   
    
    const porSimbolo = {};
    historico.getDataRange().getValues().slice(1).forEach(f => {
      const [fh, simbolo, tipo, , precio] = f;
      if (!precio) return;
      if (!(fh instanceof Date)) {
        detalleErrores.appendRow([fecha_hora, 'generarSeñales', simbolo, 'fecha_invalida', 'fecha_hora no es una fecha válida: ' + fh]);
        return;
      }
      if (!porSimbolo[simbolo]) porSimbolo[simbolo] = [];
      porSimbolo[simbolo].push({ fecha: fh, precio: Number(precio) });
    });

    const filasNuevas = [];
    const alertas = [];

    for (const simbolo in porSimbolo) {
      const serie = porSimbolo[simbolo].sort((a, b) => a.fecha - b.fecha);
      const ultimo = serie[serie.length - 1];

      const calcular = (ventanaDias) => {
        const desde = new Date(ultimo.fecha.getTime() - ventanaDias * DIA_MS);
        const ventana = serie.filter(p => p.fecha >= desde);
        const promedio = ventana.reduce((s, p) => s + p.precio, 0) / ventana.length;
        return { promedio: promedio, variacion: ultimo.precio / promedio - 1, completa: serie[0].fecha <= desde };
      };

      for (const perfil in reglas) {
        const r = reglas[perfil];
        const c = calcular(r.ventana);

        if (perfil === 'alerta_critica') {
          if (Math.abs(c.variacion) >= r.venta) alertas.push({ simbolo: simbolo, variacion: c.variacion });
          continue;
        }

        let señal = 'MANTENER';
        if (c.variacion <= r.compra) señal = 'CONSIDERAR_COMPRA';
        else if (c.variacion >= r.venta) señal = 'CONSIDERAR_VENTA';

        filasNuevas.push([fecha_hora, simbolo, perfil, ultimo.precio, c.promedio, c.variacion, señal, c.completa]);
      }
    }

    if (filasNuevas.length > 0) {
      const inicio = señalesSheet.getLastRow() + 1;
      señalesSheet.getRange(inicio, 1, filasNuevas.length, 8).setValues(filasNuevas);
      señalesSheet.getRange(inicio, 6, filasNuevas.length, 1).setNumberFormat('0.00%');
    }

    // Alerta crítica: un solo mail con todos los activos que cruzaron el umbral
    if (alertas.length > 0) {
      const cuerpo = alertas.map(a => a.simbolo + ': ' + (a.variacion * 100).toFixed(2) + '% vs. su promedio móvil').join('\n');
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Alerta crítica de cartera', cuerpo);
    }

    log.appendRow([fecha_hora, 'generarSeñales', 'Mi_Portafolio_Historico', filasNuevas.length, 'OK', alertas.length + ' alertas críticas']);

  } catch (e) {
    log.appendRow([fecha_hora, 'generarSeñales', 'Mi_Portafolio_Historico', 0, 'ERROR', e.message]);
    detalleErrores.appendRow([fecha_hora, 'generarSeñales', '-', 'error_calculo', e.message]);
  }
} 



function debugSeñales() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reglas = ss.getSheetByName('Reglas_Señales').getDataRange().getValues();
  const hist = ss.getSheetByName('Mi_Portafolio_Historico').getDataRange().getValues();
  SpreadsheetApp.getUi().alert(
    'Filas en Reglas_Señales (con encabezado): ' + reglas.length +
    '\nFilas en histórico: ' + hist.length +
    '\nTipo de fecha_hora en la fila 2: ' + Object.prototype.toString.call(hist[1][0])
  );
}




function backfillVariacionAcumulada() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historico = ss.getSheetByName('Mi_Portafolio_Historico');
  const rango = historico.getDataRange();
  const data = rango.getValues();
  
  if (data.length <= 1) return;
  
  // Guardamos el encabezado
  const encabezado = data[0];
  
  // Mapeamos las filas con su índice original para poder restaurar el orden al final
  let filasConIndices = data.slice(1).map((fila, index) => ({ fila: fila, indexOriginal: index }));
  
  // Ordenamos temporalmente por fecha_hora (columna 0) para asegurar un cálculo cronológico correcto
  filasConIndices.sort((a, b) => new Date(a.fila[0]) - new Date(b.fila[0]));
  
  const precioInicialPorSimbolo = {};
  const variacionesCalculadas = {}; // Guardaremos el resultado asociado a su índice original
  
  filasConIndices.forEach(item => {
    const fila = item.fila;
    const idx = item.indexOriginal;
    const simbolo = fila[1];
    const precioActual = fila[4];
    
    if (!(simbolo in precioInicialPorSimbolo)) {
      precioInicialPorSimbolo[simbolo] = precioActual;
    }
    
    const precioInicial = precioInicialPorSimbolo[simbolo];
    // Evitamos división por cero si el precio inicial es inválido
    const variacion = precioInicial > 0 ? (precioActual / precioInicial) - 1 : 0;
    
    variacionesCalculadas[idx] = variacion;
  });
  
  // Construimos la columna final respetando el orden original de la hoja de cálculo
  const columnaVariacion = [];
  for (let i = 0; i < data.length - 1; i++) {
    columnaVariacion.push([variacionesCalculadas[i]]);
  }
  
  // Aplicamos los valores en la columna H (columna 8)
  historico.getRange(2, 8, columnaVariacion.length, 1).setValues(columnaVariacion);
  historico.getRange(2, 8, columnaVariacion.length, 1).setNumberFormat('0.00%');
  
  Logger.log('Backfill completo y ordenado: ' + columnaVariacion.length + ' filas actualizadas.');
}


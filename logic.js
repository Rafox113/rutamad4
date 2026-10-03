/* Lógica pura (sin DOM). Se usa en el navegador y en los tests de node. */
(function (root) {
  function bikeLevel(n) { return n >= 5 ? 'good' : n >= 1 ? 'warn' : 'bad'; }

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /* Estaciones más cercanas a un punto. field: 'free_bikes' | 'empty_slots' */
  function nearest(stations, lat, lon, n) {
    return stations
      .filter(function (s) { return s.latitude != null && s.longitude != null; })
      .map(function (s) {
        return {
          nombre: s.name, metros: Math.round(haversine(lat, lon, s.latitude, s.longitude)),
          bicis: s.free_bikes, libres: s.empty_slots
        };
      })
      .sort(function (a, b) { return a.metros - b.metros; })
      .slice(0, n);
  }

  /* Camino andando (línea recta x1,3, 80 m/min) y en bici (x1,3, 250 m/min) */
  function walkMin(m) { return Math.max(1, Math.round(m * 1.3 / 80)); }
  function bikeMin(m) { return Math.max(1, Math.round(m * 1.3 / 250)); }

  /* Regla de lluvia acordada */
  function isRain(w) {
    if (!w || !w.current) return null;
    var c = w.current, code = c.weather_code;
    var p0 = w.hourly && w.hourly.precipitation_probability ? w.hourly.precipitation_probability[0] : 0;
    return (c.precipitation > 0) ||
      (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 ||
      (p0 >= 50);
  }

  /* s: {rain, bikes[3], names[3], docks, direct (true|false|null), wait, metroIssue} */
  function evaluate(s) {
    var maxBikes = Math.max.apply(null, s.bikes);
    var bestIdx = s.bikes.indexOf(maxBikes);
    var limit = s.rain ? 8 : 10;
    var bici, bus, metro, mode, why;

    if (s.rain) bici = { ok: false, level: 'bad', text: 'Con lluvia, no' };
    else if (s.docks < 1) bici = { ok: false, level: 'bad', text: 'Sin anclajes en destino' };
    else if (maxBikes < 1) bici = { ok: false, level: 'bad', text: 'Sin bicis' };
    else if (maxBikes < 5) bici = { ok: true, level: 'warn', text: 'Pocas bicis' };
    else bici = { ok: true, level: 'good', text: 'Hay bicis' };

    if (s.direct == null) bus = { ok: false, level: 'unk', text: 'Sin datos de la EMT' };
    else if (!s.direct) bus = { ok: false, level: 'bad', text: 'Sin bus directo' };
    else if (s.wait == null) bus = { ok: false, level: 'unk', text: 'Directo, sin espera' };
    else if (s.wait > limit) bus = { ok: false, level: 'warn', text: 'Espera larga: ' + s.wait + ' min' };
    else bus = { ok: true, level: 'good', text: 'Directo, ' + s.wait + ' min' };

    metro = s.metroIssue
      ? { ok: true, level: 'warn', text: 'Con incidencias' }
      : { ok: true, level: 'good', text: 'Fallback' };

    if (bici.ok) {
      mode = 'bici';
      why = 'Seco y hay ' + maxBikes + (maxBikes === 1 ? ' bici' : ' bicis') + ' en ' +
        (s.names && s.names[bestIdx] ? s.names[bestIdx] : 'la estación ' + (bestIdx + 1)) +
        ', con anclajes libres en destino.';
      if (maxBikes < 5) why += ' Quedan pocas: sal ya.';
    } else if (bus.ok) {
      mode = 'bus';
      why = s.rain
        ? 'Llueve y hay bus directo con ' + s.wait + ' min de espera.'
        : (s.docks < 1 ? 'No hay anclajes libres en destino y ' : 'No hay bicis y ') +
          'hay bus directo con ' + s.wait + ' min de espera.';
    } else if (s.metroIssue && s.direct) {
      mode = 'bus';
      why = 'El metro tiene incidencias. Hay bus directo, aunque la espera es de ' + s.wait + ' min.';
    } else {
      mode = 'metro';
      why = s.rain ? 'Llueve y no hay bus directo con espera corta.'
        : 'No hay bici disponible ni bus directo con espera corta.';
      if (s.direct == null) why += ' (Sin datos de la EMT: comprueba el bus en Google Maps.)';
      if (s.metroIssue) why += ' Hay incidencias: confirma la línea antes de salir.';
    }

    var order = ['bici', 'bus', 'metro'];
    var oks = { bici: bici.ok, bus: bus.ok || mode === 'bus', metro: true };
    var planB = null;
    for (var i = order.indexOf(mode) + 1; i < order.length; i++) {
      if (oks[order[i]]) { planB = order[i]; break; }
    }
    return {
      mode: mode, why: why, planB: planB, bici: bici, bus: bus, metro: metro,
      levels: s.bikes.map(bikeLevel)
    };
  }

  var api = { bikeLevel: bikeLevel, haversine: haversine, nearest: nearest, walkMin: walkMin,
    bikeMin: bikeMin, isRain: isRain, evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);

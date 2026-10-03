/* Cliente de la API de la EMT (MobilityLabs). Las claves viven solo en el teléfono (localStorage). */
(function (root) {
  var BASE = 'https://openapi.emtmadrid.es/';
  var token = null, tokenExp = 0;

  function getJson(url, opts) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 15000);
    opts = opts || {}; opts.signal = c.signal; opts.cache = 'no-store';
    return fetch(url, opts).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { throw new Error('Respuesta no válida (HTTP ' + r.status + ')'); });
    });
  }

  function login(cfg) {
    if (token && Date.now() < tokenExp) return Promise.resolve(token);
    return getJson(BASE + 'v1/mobilitylabs/user/login/', {
      headers: { 'X-ClientId': cfg.clientId, 'passKey': cfg.passKey }
    }).then(function (j) {
      if (j.code !== '00' && j.code !== '01') {
        var d = typeof j.description === 'string' ? j.description : JSON.stringify(j.description);
        throw new Error('Login EMT (' + j.code + '): ' + d);
      }
      var d0 = j.data && j.data[0];
      if (!d0 || !d0.accessToken) throw new Error('Login EMT sin token');
      token = d0.accessToken;
      var exp = d0.tokenDteExpiration && d0.tokenDteExpiration.$date;
      tokenExp = exp ? Math.min(exp, Date.now() + 3600e3) - 60e3 : Date.now() + 600e3;
      return token;
    });
  }

  function stopsNear(cfg, lat, lon, radius) {
    return login(cfg).then(function (tk) {
      return getJson(BASE + 'v2/transport/busemtmad/stops/arroundxy/' + lon + '/' + lat + '/' + radius + '/', {
        headers: { accessToken: tk }
      });
    }).then(function (j) {
      if (j.code !== '00') throw new Error('Paradas EMT (' + j.code + ')');
      return parseStops(j.data);
    });
  }

  function arrivals(cfg, stopId) {
    return login(cfg).then(function (tk) {
      return getJson(BASE + 'v2/transport/busemtmad/stops/' + stopId + '/arrives/', {
        method: 'POST',
        headers: { accessToken: tk, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopId: String(stopId), Text_EstimationsRequired_YN: 'Y' })
      });
    }).then(function (j) { return parseArrivals(j); });
  }

  /* --- parsing puro (testeable) --- */
  function parseStops(data) {
    return (data || []).map(function (s) {
      var c = s.geometry && s.geometry.coordinates;
      return {
        id: String(s.stopId || s.node || ''), name: s.stopName || s.name || '',
        lon: c ? c[0] : null, lat: c ? c[1] : null,
        lines: (s.dataLine || []).map(function (l) { return String(l.label || l.line); })
      };
    }).filter(function (s) { return s.id && s.lat != null; });
  }

  function parseArrivals(j) {
    if (!j || j.code !== '00' || !j.data || !j.data[0]) return [];
    return (j.data[0].Arrive || [])
      .filter(function (a) { return a.estimateArrive > 0 && a.estimateArrive < 99999; })
      .map(function (a) { return { line: String(a.line), destination: a.destination || '', sec: a.estimateArrive }; })
      .sort(function (a, b) { return a.sec - b.sec; });
  }

  /* Elige el primer bus que sirve: línea presente en alguna parada del destino y que llegas a coger andando.
     origin: [{id,name,metros}], arrByStop: {id:[arrivals]}, destLines: Set|array, walkMin: fn(metros) */
  function pickBus(origin, arrByStop, destLines, walkMin) {
    var dl = {}; (destLines || []).forEach(function (l) { dl[l] = 1; });
    var best = null, directLines = {};
    origin.forEach(function (st) {
      var walk = walkMin(st.metros);
      (arrByStop[st.id] || []).forEach(function (a) {
        if (!dl[a.line]) return;
        directLines[a.line] = 1;
        var arriveMin = Math.ceil(a.sec / 60);
        if (arriveMin < walk) return;             // llega antes de que alcances la parada
        var wait = arriveMin - walk;
        if (!best || wait < best.wait) best = { line: a.line, stop: st.name, wait: wait, walk: walk, destination: a.destination };
      });
    });
    return { direct: Object.keys(directLines).length > 0, best: best, lines: Object.keys(directLines) };
  }

  var api = { login: login, stopsNear: stopsNear, arrivals: arrivals, parseStops: parseStops,
    parseArrivals: parseArrivals, pickBus: pickBus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Emt = api;
})(typeof self !== 'undefined' ? self : this);

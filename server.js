// Adaptador HTTP para el handler de Function Compute.
// Convierte index.js en un servidor Node estandar, para desplegar el API en
// cualquier host con Node.js: Hostinger (soporte Node), Render, Railway, VPS...
// Uso:  node server.js   (escucha en process.env.PORT o 3000)
const http = require('http')
const { handler } = require('./index.js')

const PORT = Number(process.env.PORT || 3000)

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const queryParameters = {}
    u.searchParams.forEach((v, k) => { queryParameters[k] = v })
    const event = JSON.stringify({
      rawPath: u.pathname,
      requestContext: { http: { method: req.method } },
      headers: req.headers,
      queryParameters,
      body,
      isBase64Encoded: false,
    })
    handler(event, {}, (err, result) => {
      if (err) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String(err) }))
        return
      }
      const r = result || { statusCode: 500, headers: {}, body: '{}' }
      res.writeHead(r.statusCode || 200, r.headers || {})
      if (r.isBase64Encoded) res.end(Buffer.from(r.body || '', 'base64'))
      else res.end(r.body || '')
    })
  })
})

server.listen(PORT, () => {
  console.log(`Arkmonia API escuchando en el puerto ${PORT}`)
})
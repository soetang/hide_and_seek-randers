import './style.css'
import { addBoundary, addRoutes, addStops, createBaseMap, fitAll, loadBaseData, routeColor } from './shared.js'

const map = createBaseMap('print-map', {
  zoomControl: false,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap-bidragsydere &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20,
})

const routeLegendList = document.querySelector('#route-legend-list')

function renderRouteLegend(routesGeoJson) {
  const routes = [...routesGeoJson.features]
    .map((feature) => ({
      label: feature.properties.label,
      name: feature.properties.name,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'da', { numeric: true }))

  routeLegendList.replaceChildren(...routes.map((route) => {
    const item = document.createElement('li')
    item.className = 'route-legend-item'

    const swatch = document.createElement('span')
    swatch.className = 'route-line-swatch'
    swatch.style.backgroundColor = routeColor(route.label)

    const text = document.createElement('span')
    text.className = 'route-legend-text'
    text.textContent = `${route.label} — ${route.name}`

    item.append(swatch, text)
    return item
  }))
}

async function init() {
  const data = await loadBaseData()
  const boundary = addBoundary(map, data.boundary)
  const routes = addRoutes(map, data.routes)
  const stops = addStops(map, data.stops, { hoverLabels: false })
  fitAll(map, [boundary])
  renderRouteLegend(data.routes)
}

init()

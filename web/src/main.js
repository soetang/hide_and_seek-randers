import L from 'leaflet'
import './style.css'
import {
  addAfstemningsomraader,
  addBoundary,
  addRoutes,
  addSogne,
  addStops,
  createBaseMap,
  fitAll,
  formatAreaValue,
  loadBaseData,
} from './shared.js'

const map = createBaseMap('map', {
  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap-bidragsydere &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 20,
})

let sogneLayer
let afstemningLayer
let selectedMarker
let activeSuggestionIndex = -1
let currentSuggestions = []
let suggestionRequestToken = 0
let suggestionDebounceTimer
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900

const elements = {
  boundaryNote: document.querySelector('#boundary-note'),
  mobilePanelToggle: document.querySelector('#mobile-panel-toggle'),
  mobilePanelHandle: document.querySelector('#mobile-panel-handle'),
  gpsButton: document.querySelector('#gps-button'),
  toggleSogne: document.querySelector('#toggle-sogne'),
  toggleAfstemning: document.querySelector('#toggle-afstemning'),
  resultStatus: document.querySelector('#result-status'),
  resultSogn: document.querySelector('#result-sogn'),
  resultPostnummer: document.querySelector('#result-postnummer'),
  resultAfstemning: document.querySelector('#result-afstemning'),
  form: document.querySelector('#search-form'),
  input: document.querySelector('#address-input'),
  suggestions: document.querySelector('#address-suggestions'),
}

function setMobilePanelOpen(isOpen) {
  document.body.classList.toggle('panel-open', isOpen)
  elements.mobilePanelToggle.textContent = isOpen ? 'Kort' : 'Panel'
}

function updateResult(result) {
  elements.resultStatus.textContent = result.status
  elements.resultSogn.textContent = formatAreaValue(result.sogn)
  elements.resultPostnummer.textContent = formatAreaValue(result.postnummer)
  elements.resultAfstemning.textContent = formatAreaValue(result.afstemningsomraade)
}

function updateStopResult(feature) {
  updateResult({
    status: `Valgt stoppested: ${feature.properties.name}`,
    sogn: '-',
    postnummer: '-',
    afstemningsomraade: '-',
  })
}

function findNearestStopLayer(containerPoint, stopLayer) {
  let nearest = null
  let bestDistance = Infinity
  for (const layer of stopLayer.getLayers()) {
    const child = layer.getLayers ? layer.getLayers()[0] : layer
    const latlng = child.getLatLng()
    const point = map.latLngToContainerPoint(latlng)
    const distance = Math.hypot(point.x - containerPoint.x, point.y - containerPoint.y)
    if (distance < bestDistance) {
      bestDistance = distance
      nearest = { layer, latlng, distance }
    }
  }
  return nearest
}

function hideSuggestions() {
  currentSuggestions = []
  activeSuggestionIndex = -1
  elements.suggestions.hidden = true
  elements.suggestions.replaceChildren()
}

function applySuggestion(index) {
  const suggestion = currentSuggestions[index]
  if (!suggestion) return
  const value = suggestion.forslagstekst || suggestion.tekst || suggestion.adressebetegnelse || ''
  elements.input.value = value
  hideSuggestions()
}

function renderSuggestions(suggestions) {
  currentSuggestions = suggestions.slice(0, 8)
  activeSuggestionIndex = -1
  if (!currentSuggestions.length) {
    hideSuggestions()
    return
  }
  elements.suggestions.hidden = false
  elements.suggestions.replaceChildren(...currentSuggestions.map((item, index) => {
    const option = document.createElement('li')
    option.className = 'suggestion-item'
    option.textContent = item.forslagstekst || item.tekst || item.adressebetegnelse || ''
    option.addEventListener('mousedown', (event) => {
      event.preventDefault()
      applySuggestion(index)
    })
    return option
  }))
}

function placeMarker(lat, lon) {
  if (selectedMarker) selectedMarker.remove()
  selectedMarker = L.circleMarker([lat, lon], {
    radius: 8,
    color: '#d35400',
    fillColor: '#d35400',
    fillOpacity: 0.95,
    weight: 2,
  }).addTo(map)
}

async function reverseAreaLookup(lat, lon) {
  const [sogn, postnummer, afstemningsomraade] = await Promise.all([
    fetch(`https://api.dataforsyningen.dk/sogne/reverse?x=${lon}&y=${lat}&srid=4326`).then((r) => r.ok ? r.json() : null),
    fetch(`https://api.dataforsyningen.dk/postnumre/reverse?x=${lon}&y=${lat}&srid=4326`).then((r) => r.ok ? r.json() : null),
    fetch(`https://api.dataforsyningen.dk/afstemningsomraader/reverse?x=${lon}&y=${lat}&srid=4326`).then((r) => r.ok ? r.json() : null),
  ])
  return { sogn, postnummer, afstemningsomraade }
}

function isInsideBoundary(boundaryData, lat, lon) {
  const multipolygon = boundaryData.features[0].geometry.coordinates
  let inside = false
  for (const polygon of multipolygon) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0]
        const yi = ring[i][1]
        const xj = ring[j][0]
        const yj = ring[j][1]
        const intersect = ((yi > lat) !== (yj > lat)) &&
          (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi)
        if (intersect) inside = !inside
      }
    }
  }
  return inside
}

async function runLookup(boundaryData, lat, lon) {
  placeMarker(lat, lon)
  if (!isInsideBoundary(boundaryData, lat, lon)) {
    updateResult({
      status: 'Uden for spilleomraadet.',
      sogn: '-',
      postnummer: '-',
      afstemningsomraade: '-',
    })
    return
  }

  const result = await reverseAreaLookup(lat, lon)
  updateResult({
    status: 'Position fundet i spilleomraadet.',
    sogn: result.sogn?.navn,
    postnummer: result.postnummer ? `${result.postnummer.nr} ${result.postnummer.navn}` : '-',
    afstemningsomraade: result.afstemningsomraade?.navn,
  })
}

function buildAutocompletePolygon(boundaryData) {
  const geometry = boundaryData.features[0]?.geometry
  if (!geometry) return null
  const points = []
  const pushCoords = (coords) => {
    for (const entry of coords) {
      if (typeof entry[0] === 'number' && typeof entry[1] === 'number') {
        points.push(entry)
      } else {
        pushCoords(entry)
      }
    }
  }
  pushCoords(geometry.coordinates)
  if (!points.length) return null

  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Number(Math.min(...xs).toFixed(5))
  const maxX = Number(Math.max(...xs).toFixed(5))
  const minY = Number(Math.min(...ys).toFixed(5))
  const maxY = Number(Math.max(...ys).toFixed(5))

  return JSON.stringify([[
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ]])
}

async function fetchAddressSuggestions(query, polygon) {
  if (query.length < 3) return []
  const params = new URLSearchParams({
    q: query,
    srid: '4326',
    struktur: 'mini',
  })
  if (polygon) params.set('polygon', polygon)
  const url = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?${params.toString()}`
  const response = await fetch(url)
  if (!response.ok) return []
  return response.json()
}

async function geocodeAddress(text) {
  const response = await fetch(`https://api.dataforsyningen.dk/datavask/adresser?betegnelse=${encodeURIComponent(text)}`)
  if (!response.ok) return null
  const matches = await response.json()
  const best = matches.resultater?.[0]?.aktueladresse || matches.resultater?.[0]?.adresse
  if (!best) return null

  if (best.x != null && best.y != null) {
    return { lat: best.y, lon: best.x }
  }

  if (!best.href) return null
  const detailResponse = await fetch(best.href)
  if (!detailResponse.ok) return null
  const detail = await detailResponse.json()

  const coordinates =
    detail?.adgangsadresse?.adgangspunkt?.koordinater ||
    detail?.adgangspunkt?.koordinater ||
    (detail?.x != null && detail?.y != null ? [detail.x, detail.y] : null)

  if (!coordinates) return null
  const [lon, lat] = coordinates
  return { lat, lon }
}

async function init() {
  const data = await loadBaseData()
  const autocompletePolygon = buildAutocompletePolygon(data.boundary)
  elements.boundaryNote.textContent = data.metadata.boundary_note
  const boundaryLayer = addBoundary(map, data.boundary)
  const routeLayer = addRoutes(map, data.routes)
  const stopLayer = addStops(map, data.stops, {
    touchMode: isTouchDevice,
    hoverLabels: !isTouchDevice,
    onStopSelect: updateStopResult,
  })
  sogneLayer = addSogne(map, data.sogne)
  afstemningLayer = addAfstemningsomraader(map, data.afstemningsomraader)
  map.removeLayer(afstemningLayer)
  fitAll(map, [boundaryLayer])

  window.__appDebug = {
    map,
    stopLayer,
  }

  document.body.classList.toggle('is-mobile-app', isTouchDevice)
  if (isTouchDevice) {
    setMobilePanelOpen(false)
    elements.mobilePanelToggle.hidden = false
  }

  elements.mobilePanelToggle.addEventListener('click', () => {
    setMobilePanelOpen(!document.body.classList.contains('panel-open'))
  })
  elements.mobilePanelHandle.addEventListener('click', () => {
    if (!isTouchDevice) return
    setMobilePanelOpen(!document.body.classList.contains('panel-open'))
  })

  elements.toggleSogne.addEventListener('click', () => {
    if (map.hasLayer(sogneLayer)) {
      map.removeLayer(sogneLayer)
    } else {
      sogneLayer.addTo(map)
    }
  })

  elements.toggleAfstemning.addEventListener('click', () => {
    if (map.hasLayer(afstemningLayer)) {
      map.removeLayer(afstemningLayer)
    } else {
      afstemningLayer.addTo(map)
    }
  })

  elements.gpsButton.addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await runLookup(data.boundary, position.coords.latitude, position.coords.longitude)
        if (isTouchDevice) setMobilePanelOpen(false)
      },
      () => updateResult({ status: 'GPS blev afvist eller fejlede.', sogn: '-', postnummer: '-', afstemningsomraade: '-' }),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  })

  if (isTouchDevice) {
    map.on('click', (event) => {
      const nearest = findNearestStopLayer(event.containerPoint, stopLayer)
      if (!nearest || nearest.distance > 18) return
      nearest.layer.openPopup(nearest.latlng)
      nearest.layer.fire('click')
    })
  }

  elements.input.addEventListener('input', (event) => {
    const value = event.target.value
    window.clearTimeout(suggestionDebounceTimer)
    suggestionDebounceTimer = window.setTimeout(async () => {
      const token = ++suggestionRequestToken
      let suggestions = []
      try {
        suggestions = await fetchAddressSuggestions(value, autocompletePolygon)
      } catch {
        suggestions = []
      }
      if (token !== suggestionRequestToken) return
      renderSuggestions(suggestions)
    }, 250)
  })

  elements.input.addEventListener('keydown', (event) => {
    if (elements.suggestions.hidden || !currentSuggestions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, currentSuggestions.length - 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0)
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault()
      applySuggestion(activeSuggestionIndex)
      return
    } else if (event.key === 'Escape') {
      hideSuggestions()
      return
    } else {
      return
    }

    ;[...elements.suggestions.children].forEach((child, index) => {
      child.classList.toggle('is-active', index === activeSuggestionIndex)
    })
  })

  elements.input.addEventListener('blur', () => {
    window.setTimeout(hideSuggestions, 150)
  })

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    hideSuggestions()
    const value = elements.input.value.trim()
    if (!value) return
    const coordinate = await geocodeAddress(value)
    if (!coordinate) {
      updateResult({ status: 'Adressen kunne ikke findes.', sogn: '-', postnummer: '-', afstemningsomraade: '-' })
      return
    }
    await runLookup(data.boundary, coordinate.lat, coordinate.lon)
    if (isTouchDevice) setMobilePanelOpen(false)
  })

  document.body.dataset.appReady = 'true'
}

init()

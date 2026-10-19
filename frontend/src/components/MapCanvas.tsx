import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 地図の入口。Google Maps のキー（VITE_GOOGLE_MAPS_API_KEY）があれば Google、無い・読み込めない・キーが弾かれたら地理院地図（Leaflet）で表示する。
// FE動態（fe-dotai src/components/map）の作りを、動態マップで要る分だけに絞って移したもの。
// ピンは HTML（付け根が地点に来るように、中身の CSS で位置を合わせる）。

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  html: string;
  zIndex?: number;
  /** ホバーで出す文（改行は \n） */
  tooltip?: string;
  onClick?: () => void;
  /** カーソルが乗った / 離れた */
  onHover?: (on: boolean) => void;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface MapCanvasHandle {
  /** 地図がまだ準備中なら false（あとでもう一度呼ぶ） */
  fit: (points: LatLngPoint[], maxZoom?: number) => boolean;
}

interface Props {
  pins: MapPin[];
  /** Google を使えずに地理院地図へ切り替えたとき */
  onFallback?: (reason: string) => void;
}

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
const TOKYO = { lat: 35.69, lng: 139.72 };

/* ---------- Google の読み込み（1 回だけ） ---------- */

type GoogleWindow = typeof window & { __fsmGmapsReady?: () => void; gm_authFailure?: () => void };
let loader: Promise<void> | null = null;
let authFailed = false;
const authFailListeners = new Set<() => void>();

const loadGoogleMaps = (): Promise<void> => {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const w = window as GoogleWindow;
    // キーが無効・HTTP リファラーの制限で弾かれたときに Google が呼ぶ
    w.gm_authFailure = () => {
      authFailed = true;
      authFailListeners.forEach(fn => fn());
    };
    w.__fsmGmapsReady = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&v=weekly&loading=async&language=ja&region=JP&callback=__fsmGmapsReady`;
    script.async = true;
    script.onerror = () => {
      loader = null;
      reject(new Error('Google Maps を読み込めませんでした'));
    };
    document.head.append(script);
  });
  return loader;
};

const htmlToEl = (html: string): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild as HTMLElement;
};

/** google.maps の読み込み後に作る（OverlayView はそれまで無い）。Map ID なしで HTML のピンを置く */
const createOverlayClass = () =>
  class HtmlPin extends google.maps.OverlayView {
    private readonly box: HTMLDivElement;
    private readonly pos: google.maps.LatLngLiteral;
    constructor(map: google.maps.Map, pin: MapPin) {
      super();
      this.pos = { lat: pin.lat, lng: pin.lng };
      this.box = document.createElement('div');
      this.box.style.position = 'absolute';
      this.box.style.zIndex = String(pin.zIndex ?? 0);
      const el = htmlToEl(pin.html);
      if (pin.tooltip) el.title = pin.tooltip;
      this.box.append(el);
      if (pin.onHover) {
        this.box.addEventListener('mouseenter', () => pin.onHover?.(true));
        this.box.addEventListener('mouseleave', () => pin.onHover?.(false));
      }
      if (pin.onClick) {
        this.box.style.cursor = 'pointer';
        this.box.addEventListener('click', e => {
          e.stopPropagation();
          pin.onClick?.();
        });
      }
      this.setMap(map);
    }
    onAdd() {
      this.getPanes()?.overlayMouseTarget.append(this.box);
    }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(this.pos));
      if (!p) return;
      this.box.style.left = `${p.x}px`;
      this.box.style.top = `${p.y}px`;
    }
    onRemove() {
      this.box.remove();
    }
  };

/* ---------- Google 版 ---------- */

const GoogleCanvas = forwardRef<MapCanvasHandle, Props & { onFail: (reason: string) => void }>(({ pins, onFail }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const overlayClass = useRef<ReturnType<typeof createOverlayClass> | null>(null);
  const overlays = useRef<google.maps.OverlayView[]>([]);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useImperativeHandle(ref, () => ({
    fit: (points, maxZoom = 15) => {
      if (!map || points.length === 0) return false;
      const b = new google.maps.LatLngBounds();
      points.forEach(p => b.extend(p));
      map.fitBounds(b, 60);
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > maxZoom) map.setZoom(maxZoom);
      });
      return true;
    },
  }), [map]);

  useEffect(() => {
    if (authFailed) {
      onFailRef.current('Google Maps のキーが使えませんでした');
      return;
    }
    let cancelled = false;
    const onAuthFail = () => onFailRef.current('Google Maps のキーが使えませんでした（この URL が許可されていない可能性）');
    authFailListeners.add(onAuthFail);
    loadGoogleMaps()
      .then(async () => {
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        if (cancelled || authFailed || !elRef.current) return;
        overlayClass.current = createOverlayClass();
        setMap(
          new Map(elRef.current, {
            center: TOKYO,
            zoom: 10,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            gestureHandling: 'greedy',
            // 店や施設のピンを消して、FE と訪問先のピンを見やすくする
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit.station.bus', stylers: [{ visibility: 'off' }] },
            ],
          })
        );
      })
      .catch(() => onFailRef.current('Google Maps を読み込めませんでした'));
    return () => {
      cancelled = true;
      authFailListeners.delete(onAuthFail);
    };
  }, []);

  useEffect(() => {
    if (!map || !overlayClass.current) return;
    overlays.current.forEach(o => o.setMap(null));
    const Cls = overlayClass.current;
    overlays.current = pins.map(p => new Cls(map, p));
  }, [map, pins]);

  return <div ref={elRef} className="map-canvas" />;
});

/* ---------- 地理院地図（Leaflet）版 ---------- */

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LeafletCanvas = forwardRef<MapCanvasHandle, Props>(({ pins }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useImperativeHandle(ref, () => ({
    fit: (points, maxZoom = 15) => {
      const map = mapRef.current;
      if (!map || points.length === 0) return false;
      map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom });
      return true;
    },
  }), []);

  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false }).setView([TOKYO.lat, TOKYO.lng], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    // 地図の CSS が後から効いたときなど、大きさが変わらないまま測り違えることがあるので、少し後にも測り直す
    const timers = [50, 300, 1000].map(ms => window.setTimeout(() => map.invalidateSize(), ms));
    ro.observe(elRef.current);
    return () => {
      timers.forEach(t => window.clearTimeout(t));
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of pins) {
      const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'map-pin-host', html: p.html, iconSize: [0, 0] }), zIndexOffset: p.zIndex ?? 0 });
      if (p.tooltip) m.bindTooltip(escapeHtml(p.tooltip).replace(/\n/g, '<br>'), { direction: 'top', offset: [0, -10] });
      if (p.onClick) m.on('click', p.onClick);
      if (p.onHover) {
        m.on('mouseover', () => p.onHover?.(true));
        m.on('mouseout', () => p.onHover?.(false));
      }
      m.addTo(layer);
    }
  }, [pins]);

  return <div ref={elRef} className="map-canvas" />;
});

/* ---------- 入口 ---------- */

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(({ pins, onFallback }, ref) => {
  const [googleFailed, setGoogleFailed] = useState(authFailed);
  if (API_KEY && !googleFailed) {
    return (
      <GoogleCanvas
        ref={ref}
        pins={pins}
        onFail={reason => {
          setGoogleFailed(true);
          onFallback?.(reason);
        }}
      />
    );
  }
  return <LeafletCanvas ref={ref} pins={pins} />;
});

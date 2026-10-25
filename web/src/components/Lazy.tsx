import { lazy, Suspense, type ComponentProps } from 'react';
import { Carregando } from './Carregando';

const GraficosL = lazy(() => import('../charts/Graficos'));
const MapaL = lazy(() => import('../mapa/Mapa'));

export function Graficos(p: ComponentProps<typeof GraficosL>) {
  return (
    <Suspense fallback={<Carregando texto="Carregando gráficos…" />}>
      <GraficosL {...p} />
    </Suspense>
  );
}

export function Mapa(p: ComponentProps<typeof MapaL>) {
  return (
    <Suspense fallback={<Carregando texto="Carregando mapa…" altura="h-72" />}>
      <MapaL {...p} />
    </Suspense>
  );
}

import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { getJson } from '../lib/api';

export type Feat = Feature<Geometry, { codarea: string; sigla?: string; uf?: string }>;

const cache = new Map<string, Promise<Feat[]>>();

/** Carrega uma malha TopoJSON de /data/geo e devolve as features do objeto pedido. */
export function carregarMalha(path: string, objeto: string): Promise<Feat[]> {
  const k = `${path}#${objeto}`;
  let p = cache.get(k);
  if (!p) {
    p = getJson<Topology>(path).then((topo) => {
      const obj = topo.objects[objeto] as GeometryCollection;
      const fc = feature(topo, obj) as unknown as FeatureCollection<Geometry, Feat['properties']>;
      return fc.features as Feat[];
    });
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

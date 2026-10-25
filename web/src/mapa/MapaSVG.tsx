import { useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import type { Candidato } from '../types/contrato';
import type { Feat } from './geo';
import type { MapaDatum } from './dados';
import { textoValor, type CamadaId, type Escala, type Paleta } from './camadas';
import Dica from './Dica';

interface Props {
  features: Feat[];
  chaveDe: (f: Feat) => string;
  dados: Map<string, MapaDatum>;
  camada: CamadaId;
  escala: Escala;
  paleta: Paleta;
  cands: Candidato[];
  passa?: (d: MapaDatum) => boolean;
  focavel?: boolean;
  destaque?: string | null;
  excluirAjuste?: string[];
  raioMax: number;
  maxRestantes: number;
  rotulo: string;
  onSelect?: (d: MapaDatum) => void;
}

const W = 800;

export default function MapaSVG(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<{ d: MapaDatum; x: number; y: number } | null>(null);

  const geo = useMemo(() => {
    const ajuste: FeatureCollection = {
      type: 'FeatureCollection',
      features: p.excluirAjuste?.length ? p.features.filter((f) => !p.excluirAjuste!.includes(f.properties.codarea)) : p.features,
    };
    const proj = geoMercator().fitWidth(W, ajuste);
    let path = geoPath(proj);
    let H = Math.ceil(path.bounds(ajuste)[1][1]);
    const HMAX = Math.round(W * 1.05);
    if (H > HMAX) {
      proj.fitSize([W, HMAX], ajuste);
      path = geoPath(proj);
      H = HMAX;
    }
    return {
      H: Math.max(H, 200),
      itens: p.features.map((f) => ({ k: p.chaveDe(f), d: path(f) ?? '', c: path.centroid(f) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.features]);

  const moverDica = (e: React.MouseEvent) => {
    const k = (e.target as SVGElement).getAttribute?.('data-k');
    const d = k ? p.dados.get(k) : undefined;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return setDica(null);
    setDica({ d, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const focarDica = (k: string, c: [number, number]) => {
    const d = p.dados.get(k);
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    const esc = box.width / W;
    setDica({ d, x: c[0] * esc, y: c[1] * esc });
  };

  const largura = ref.current?.clientWidth ?? 600;

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${W} ${geo.H}`}
        className="mx-auto block h-auto max-h-[75vh] w-full"
        role="group"
        aria-label={p.rotulo}
        onMouseMove={moverDica}
        onMouseLeave={() => setDica(null)}
        onClick={(e) => {
          const k = (e.target as SVGElement).getAttribute?.('data-k');
          const d = k ? p.dados.get(k) : undefined;
          if (d && p.onSelect) p.onSelect(d);
        }}
      >
        <g strokeLinejoin="round">
          {geo.itens.map(({ k, d: path, c }) => {
            const d = p.dados.get(k);
            const ok = d ? (p.passa ? p.passa(d) : true) : false;
            const fill = d && ok ? p.escala.cor(p.escala.valor(d)) : p.paleta.semDado;
            return (
              <path
                key={k}
                d={path}
                data-k={k}
                fill={fill}
                fillOpacity={d && !ok ? 0.35 : 1}
                stroke={p.destaque === k ? 'currentColor' : p.paleta.borda}
                strokeWidth={p.destaque === k ? 2.5 : p.focavel ? 0.6 : 0.25}
                className={`${p.onSelect && d ? 'cursor-pointer' : ''} outline-none hover:opacity-80 focus-visible:stroke-current`}
                {...(p.focavel && d
                  ? {
                      tabIndex: 0,
                      role: 'button',
                      'aria-label': `${d.nome}: ${textoValor(p.camada, d, p.cands)}`,
                      onFocus: () => focarDica(k, c),
                      onBlur: () => setDica(null),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if ((e.key === 'Enter' || e.key === ' ') && p.onSelect) {
                          e.preventDefault();
                          p.onSelect(d);
                        }
                      },
                    }
                  : {})}
              />
            );
          })}
        </g>
        {p.camada === 'faltam' && (
          <g pointerEvents="none">
            {geo.itens
              .map(({ k, c }) => ({ k, c, d: p.dados.get(k) }))
              .filter((x) => x.d && (x.d.restantes ?? 0) > 0 && (!p.passa || p.passa(x.d)))
              .sort((x, y) => (y.d!.restantes ?? 0) - (x.d!.restantes ?? 0))
              .map(({ k, c, d }) => (
                <circle
                  key={k}
                  cx={c[0]}
                  cy={c[1]}
                  r={Math.max(0.8, p.raioMax * Math.sqrt((d!.restantes ?? 0) / p.maxRestantes))}
                  className="fill-slate-800/40 stroke-slate-900 dark:fill-slate-100/40 dark:stroke-slate-50"
                  strokeWidth={0.6}
                />
              ))}
          </g>
        )}
      </svg>
      {dica && (
        <div
          className="pointer-events-none absolute z-10 w-64 max-w-[80vw] rounded-lg border border-slate-200 bg-white/95 p-2.5 text-slate-900 shadow-lg dark:border-slate-600 dark:bg-slate-900/95 dark:text-slate-100"
          style={{
            left: Math.min(Math.max(4, dica.x + 12), Math.max(4, largura - 264)),
            top: dica.y + 16,
          }}
        >
          <Dica d={dica.d} cands={p.cands} />
        </div>
      )}
    </div>
  );
}

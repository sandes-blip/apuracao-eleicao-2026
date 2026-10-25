import { useState } from 'react';
import type { BR } from '../types/contrato';
import { AVISO } from '../lib/geo-ref';
import { fmtInt, fmtPct, fmtProb, horaTSE } from '../lib/format';

/** Gera um PNG do placar + projeção (com o aviso gravado na imagem) e compartilha ou baixa. */
export default function Compartilhar({ br }: { br: BR }) {
  const [msg, setMsg] = useState<string | null>(null);

  const gerar = async () => {
    setMsg(null);
    try {
      const blob = await desenhar(br);
      const arquivo = new File([blob], 'apuracao-2turno-2026.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [arquivo] })) {
        await nav.share({ files: [arquivo], title: 'Apuração 2º turno 2026', text: AVISO });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = arquivo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg('Imagem baixada.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg('Não foi possível gerar a imagem.');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn" onClick={gerar}>
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M15 8a3 3 0 10-2.98-3.33L7.1 7.13a3 3 0 100 5.74l4.92 2.46A3 3 0 1013 13.5l-4.9-2.45a3 3 0 000-2.1L13 6.5A3 3 0 0015 8z" /></svg>
        Compartilhar
      </button>
      {msg && <span className="mini" role="status">{msg}</span>}
    </div>
  );
}

export function desenhar(br: BR): Promise<Blob> {
  const W = 1080, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const fonte = (peso: number, px: number) => `${peso} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#0f172a';
  g.font = fonte(700, 46);
  g.fillText(br.titulo || '2º turno presidencial 2026', 60, 100);
  g.font = fonte(400, 28);
  g.fillStyle = '#475569';
  g.fillText(`Placar oficial do TSE · ${fmtPct(br.apuracao.pct_secoes, 2)} das seções · atualizado às ${horaTSE(br.atualizado_tse)}`, 60, 148);

  let y = 220;
  for (const c of br.candidatos.slice(0, 2)) {
    const p = br.apuracao.pct?.[c.n] ?? 0;
    g.fillStyle = '#0f172a';
    g.font = fonte(600, 38);
    g.fillText(`${c.nome} (${c.n})`, 60, y);
    g.font = fonte(800, 56);
    const tx = fmtPct(p, 2);
    g.fillText(tx, W - 60 - g.measureText(tx).width, y + 6);
    g.font = fonte(400, 26);
    g.fillStyle = '#475569';
    g.fillText(`${fmtInt(br.apuracao.votos?.[c.n])} votos`, 60, y + 42);
    g.fillStyle = '#e2e8f0';
    roundRect(g, 60, y + 62, W - 120, 30, 15);
    g.fillStyle = c.cor;
    roundRect(g, 60, y + 62, Math.max(30, ((W - 120) * p) / 100), 30, 15);
    g.fillStyle = '#0f172a';
    g.fillRect(W / 2, y + 56, 2, 42);
    y += 170;
  }
  if (br.apuracao.eleito) {
    const c = br.candidatos.find((x) => x.n === br.apuracao.eleito);
    g.fillStyle = '#0f172a';
    g.font = fonte(700, 30);
    g.fillText(`${c?.nome ?? br.apuracao.eleito} eleito, segundo o TSE`, 60, y - 20);
    y += 30;
  }

  g.fillStyle = '#f1f5f9';
  roundRect(g, 40, y, W - 80, 300, 20);
  g.fillStyle = '#0f172a';
  g.font = fonte(700, 34);
  g.fillText('Projeção estatística do resultado final', 70, y + 56);
  const pr = br.projecao;
  if (pr.disponivel && pr.p2) {
    let yy = y + 120;
    for (const c of br.candidatos.slice(0, 2)) {
      const ic = pr.p2.ic95?.[c.n];
      g.fillStyle = c.cor;
      g.beginPath();
      g.arc(82, yy - 12, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f172a';
      g.font = fonte(600, 32);
      g.fillText(`${c.nome}: ${fmtPct(pr.p2.pct[c.n], 1)}`, 106, yy);
      g.font = fonte(400, 26);
      g.fillStyle = '#334155';
      g.fillText(`faixa de 95%: ${ic ? `${fmtPct(ic[0], 1)} a ${fmtPct(ic[1], 1)}` : '-'} · chance de terminar à frente: ${fmtProb(pr.p2.prob[c.n])}`, 106, yy + 38);
      yy += 100;
    }
  } else {
    g.font = fonte(400, 28);
    g.fillStyle = '#334155';
    g.fillText(pr.motivo || 'Projeção ainda indisponível.', 70, y + 120);
  }

  // aviso gravado
  g.fillStyle = '#fef3c7';
  g.fillRect(0, H - 150, W, 150);
  g.fillStyle = '#78350f';
  g.font = fonte(700, 28);
  quebrar(g, AVISO, 60, H - 100, W - 120, 36);
  g.font = fonte(400, 22);
  g.fillStyle = '#92400e';
  g.fillText(`${location.host} · dados: resultados.tse.jus.br`, 60, H - 24);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

function quebrar(g: CanvasRenderingContext2D, txt: string, x: number, y: number, max: number, lh: number) {
  const pal = txt.split(' ');
  let linha = '';
  for (const p of pal) {
    const t = linha ? `${linha} ${p}` : p;
    if (g.measureText(t).width > max && linha) {
      g.fillText(linha, x, y);
      linha = p;
      y += lh;
    } else linha = t;
  }
  if (linha) g.fillText(linha, x, y);
}

import { useState } from 'react';
import type { Candidato } from '../types/contrato';

function iniciais(nome: string) {
  const p = nome.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Foto do candidato com recuo para as iniciais se a imagem falhar. */
export default function Avatar({ c, tamanho = 44 }: { c: Candidato; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tamanho, height: tamanho, borderColor: c.cor };
  if (!c.foto || falhou) {
    return (
      <span
        aria-hidden="true"
        style={{ ...estilo, backgroundColor: c.cor, fontSize: tamanho * 0.38 }}
        className="inline-flex flex-none items-center justify-center rounded-full border-2 font-semibold text-white"
      >
        {iniciais(c.nome)}
      </span>
    );
  }
  return (
    <img
      src={c.foto}
      alt=""
      width={tamanho}
      height={tamanho}
      loading="lazy"
      onError={() => setFalhou(true)}
      style={estilo}
      className="flex-none rounded-full border-2 bg-slate-200 object-cover dark:bg-slate-700"
    />
  );
}

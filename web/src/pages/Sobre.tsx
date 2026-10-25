import Aviso from '../components/Aviso';

export default function Sobre() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sobre e avisos</h1>
      <Aviso />
      <section className="card space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
        <h2 className="titulo-secao">Independência</h2>
        <p>
          Este é um portal independente, sem vínculo com partidos, candidatos, coligações ou campanhas, e sem publicidade política.
          As cores dos candidatos são neutras e fixas, escolhidas para não remeter a partidos, e a ordem é sempre a do número de urna
          (13, depois 22), nunca a de quem está à frente.
        </p>
        <h2 className="titulo-secao">Fonte oficial</h2>
        <p>
          Todos os números vêm dos arquivos de divulgação do Tribunal Superior Eleitoral. O resultado oficial é o do TSE, disponível em{' '}
          <a className="link" href="https://resultados.tse.jus.br" target="_blank" rel="noopener noreferrer">resultados.tse.jus.br</a>.
          A projeção exibida aqui é uma estimativa estatística independente e não substitui o resultado oficial.
        </p>
        <h2 className="titulo-secao">Textos de análise</h2>
        <p>
          Os textos de análise são redigidos por inteligência artificial ou por modelos de frase automáticos, sempre a partir dos números
          calculados pelo motor estatístico. Cada texto indica sua origem.
        </p>
        <h2 className="titulo-secao">Privacidade (LGPD)</h2>
        <p>
          O portal não tem login, não pede cadastro e não coleta dados pessoais. Não há comentários abertos. Eventuais estatísticas de
          acesso são anônimas e agregadas.
        </p>
        <h2 className="titulo-secao">Contato</h2>
        <p>
          Inovaxio ·{' '}
          <a className="link" href="mailto:sandes@yvesscopy.com">sandes@yvesscopy.com</a>
        </p>
      </section>
    </div>
  );
}

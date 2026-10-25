export default function SemDados({ semDados }: { semDados: boolean }) {
  return (
    <div className="card mx-auto max-w-xl text-center">
      <h1 className="text-xl font-bold">{semDados ? 'Aguardando o início da apuração' : 'Dados indisponíveis no momento'}</h1>
      <p className="sub mt-2">
        {semDados
          ? 'A votação vai das 8h às 17h (horário de Brasília). Os primeiros números oficiais do TSE aparecem aqui logo após o encerramento.'
          : 'Não foi possível carregar os dados agora. A página tenta de novo automaticamente a cada 30 segundos.'}
      </p>
    </div>
  );
}

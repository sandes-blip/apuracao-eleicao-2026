import { Link } from 'react-router-dom';

export default function NaoEncontrada() {
  return (
    <div className="card mx-auto max-w-lg text-center">
      <h1 className="text-xl font-bold">Página não encontrada</h1>
      <p className="sub mt-2">O endereço pode estar incorreto.</p>
      <Link to="/" className="btn mt-4">Voltar ao início</Link>
    </div>
  );
}

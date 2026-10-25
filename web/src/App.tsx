import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DadosProvider } from './lib/dados';
import Layout from './components/Layout';
import Inicio from './pages/Inicio';
import { Carregando } from './components/Carregando';

const Regiao = lazy(() => import('./pages/Regiao'));
const Estado = lazy(() => import('./pages/Estado'));
const Municipio = lazy(() => import('./pages/Municipio'));
const LinhaDoTempo = lazy(() => import('./pages/LinhaDoTempo'));
const Replay = lazy(() => import('./pages/Replay'));
const Metodologia = lazy(() => import('./pages/Metodologia'));
const Sobre = lazy(() => import('./pages/Sobre'));
const NaoEncontrada = lazy(() => import('./pages/NaoEncontrada'));

export default function App() {
  return (
    <DadosProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Inicio />} />
              <Route path="regiao/:r" element={<Regiao />} />
              <Route path="uf/:uf" element={<Estado />} />
              <Route path="municipio" element={<Municipio />} />
              <Route path="municipio/:uf/:cd" element={<Municipio />} />
              <Route path="linha-do-tempo" element={<LinhaDoTempo />} />
              <Route path="replay" element={<Replay />} />
              <Route path="metodologia" element={<Metodologia />} />
              <Route path="sobre" element={<Sobre />} />
              <Route path="*" element={<NaoEncontrada />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DadosProvider>
  );
}

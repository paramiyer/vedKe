import { Link, Navigate, Route, Routes } from "react-router-dom";
import { isDevToolsEnabled } from "./lib/devtoolsGate";
import { AnnotatePage } from "./routes/AnnotatePage";
import { SuktaKaraokePage } from "./routes/SuktaKaraokePage";

const SAMPLES = ["sample"];

function Home(): JSX.Element {
  const showAnnotate = isDevToolsEnabled();

  return (
    <main style={{ padding: 20 }}>
      <h1>Veda Image Karaoke</h1>
      <p>Image-first karaoke with bbox + timing annotations.</p>

      <h2>Available Suktas</h2>
      <ul>
        {SAMPLES.map((slug) => (
          <li key={slug}>
            <Link to={`/suktas/${slug}`}>{slug}</Link>
          </li>
        ))}
      </ul>

      {showAnnotate ? (
        <p>
          <Link to="/annotate">Open /annotate</Link>
        </p>
      ) : (
        <p>/annotate is hidden. Enable via VITE_DEV_TOOLS=true or localStorage key `veda.devtools=1`.</p>
      )}
    </main>
  );
}

function AnnotateRoute(): JSX.Element {
  if (!isDevToolsEnabled()) {
    return <Navigate to="/" replace />;
  }
  return <AnnotatePage slugs={SAMPLES} />;
}

function NotFound(): JSX.Element {
  return <main style={{ padding: 20 }}>Not found.</main>;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/suktas/:slug" element={<SuktaKaraokePage />} />
      <Route path="/annotate" element={<AnnotateRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

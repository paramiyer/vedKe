import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { isDevToolsEnabled } from "./lib/devtoolsGate";
import { fallbackSlugs, hasVisualAssets, loadSuktaSlugs } from "./lib/suktaManifest";
import { AnnotatePage } from "./routes/AnnotatePage";
import { SuktaKaraokePage } from "./routes/SuktaKaraokePage";
import { VisualPage } from "./routes/VisualPage";

type HomeProps = {
  slugs: string[];
  visualAvailable: Record<string, boolean>;
};

function Home({ slugs, visualAvailable }: HomeProps): JSX.Element {
  const showAnnotate = isDevToolsEnabled();

  return (
    <main style={{ padding: 20 }}>
      <h1>Veda Image Karaoke</h1>
      <p>Image-first karaoke with bbox + timing annotations.</p>

      <h2>Available Suktas</h2>
      <ul>
        {slugs.map((slug) => (
          <li key={slug}>
            <Link to={`/suktas/${slug}`}>{slug} (karaoke)</Link>
            {visualAvailable[slug] ? (
              <>
                {" | "}
                <Link to={`/slugs/${slug}/visual`}>{slug} (visual)</Link>
              </>
            ) : (
              " | visual unavailable"
            )}
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

type AnnotateRouteProps = {
  slugs: string[];
};

function AnnotateRoute({ slugs }: AnnotateRouteProps): JSX.Element {
  if (!isDevToolsEnabled()) {
    return <Navigate to="/" replace />;
  }
  return <AnnotatePage slugs={slugs} />;
}

function NotFound(): JSX.Element {
  return <main style={{ padding: 20 }}>Not found.</main>;
}

function VisualRoute(): JSX.Element {
  const { slug = "sample" } = useParams();
  return <VisualPage slug={slug} />;
}

export default function App(): JSX.Element {
  const [slugs, setSlugs] = useState<string[]>(fallbackSlugs());
  const [visualAvailable, setVisualAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSuktaSlugs().then((loaded) => {
      setSlugs(loaded);
      Promise.all(
        loaded.map(async (slug) => {
          const available = await hasVisualAssets(slug);
          return [slug, available] as const;
        })
      ).then((results) => {
        setVisualAvailable(Object.fromEntries(results));
      });
    });
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home slugs={slugs} visualAvailable={visualAvailable} />} />
      <Route path="/suktas/:slug" element={<SuktaKaraokePage />} />
      <Route path="/slugs/:slug/visual" element={<VisualRoute />} />
      <Route path="/annotate" element={<AnnotateRoute slugs={slugs} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

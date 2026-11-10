import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Download from "./pages/Download.jsx";
import Code from "./pages/Code.jsx";
import Privacy from "./pages/Privacy.jsx";
import Features from "./pages/Features.jsx";
import Updates from "./pages/Updates.jsx";
import Blog from "./pages/Blog.jsx";
import Docs from "./pages/Docs.jsx";
import About from "./pages/About.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="download" element={<Download />} />
        <Route path="code" element={<Code />} />
        <Route path="features" element={<Features />} />
        <Route path="updates" element={<Updates />} />
        <Route path="blog" element={<Blog />} />
        <Route path="docs" element={<Docs />} />
        <Route path="about" element={<About />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

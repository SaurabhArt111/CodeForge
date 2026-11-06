import { Link } from "react-router-dom";
import { url } from "../lib/site.js";
export default function NotFound() {
  return (
    <div className="wrap prose" style={{ paddingBlock: 96, minHeight: "60vh" }}>
      <h1>Page not found</h1>
      <p>There is nothing at this address. Try the <Link to="/">home page</Link>, the <a href={url("app/")}>web editor</a> or the <Link to="/download">download page</Link>.</p>
    </div>
  );
}

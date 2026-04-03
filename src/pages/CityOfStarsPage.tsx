import { Link } from "react-router-dom";
import CityOfStars from "../components/CityOfStars";

export default function CityOfStarsPage() {
  return (
    <div className="relative min-h-screen">
      <Link
        to="/"
        className="pointer-events-auto absolute left-6 top-6 z-20 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs uppercase tracking-widest text-white/90 backdrop-blur-md transition hover:bg-white/15"
      >
        ← CityMood
      </Link>
      <CityOfStars />
    </div>
  );
}

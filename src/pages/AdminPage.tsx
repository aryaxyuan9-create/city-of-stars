import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PASSWORD = "cityofstars2024";

type Story = {
  id: string;
  text: string;
  image_url: string | null;
  location: string | null;
  taken_at: string | null;
  created_at: string;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchStories = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false });
    setStories(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (authed) fetchStories();
  }, [authed]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this story?")) return;
    setDeleting(id);
    await supabase.from("stories").delete().eq("id", id);
    setStories((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  };

  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0820",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(230,230,250,0.12)",
          borderRadius: "16px",
          padding: "40px",
          width: "320px",
          textAlign: "center",
        }}>
          <div style={{ color: "#E6E6FA", fontSize: "1.3rem", fontStyle: "italic", marginBottom: "24px" }}>
            Admin
          </div>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input === PASSWORD && setAuthed(true)}
            placeholder="password"
            style={{
              width: "100%",
              background: "rgba(0,0,128,0.2)",
              border: "1px solid rgba(230,230,250,0.1)",
              borderRadius: "10px",
              padding: "12px 16px",
              color: "#E6E6FA",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: "12px",
            }}
          />
          <button
            onClick={() => input === PASSWORD && setAuthed(true)}
            style={{
              width: "100%",
              background: "#FFEC8B",
              color: "#1C1C1C",
              border: "none",
              borderRadius: "10px",
              padding: "12px",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Enter
          </button>
          {input && input !== PASSWORD && (
            <div style={{ color: "rgba(255,100,100,0.7)", fontSize: "12px", marginTop: "10px" }}>
              incorrect password
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0820",
      padding: "40px",
      fontFamily: "'Playfair Display', Georgia, serif",
      color: "#E6E6FA",
    }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "1.6rem", fontStyle: "italic", fontWeight: 400, color: "#FFEC8B" }}>
            City of Stars — Admin
          </h1>
          <span style={{ fontSize: "13px", color: "rgba(230,230,250,0.4)" }}>
            {stories.length} stories
          </span>
        </div>

        {loading ? (
          <div style={{ color: "rgba(230,230,250,0.4)", fontStyle: "italic" }}>loading...</div>
        ) : stories.length === 0 ? (
          <div style={{ color: "rgba(230,230,250,0.4)", fontStyle: "italic" }}>no stories yet</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {stories.map((story) => (
              <div key={story.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(230,230,250,0.1)",
                borderRadius: "14px",
                overflow: "hidden",
              }}>
                {story.image_url && (
                  <img
                    src={story.image_url}
                    alt=""
                    style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }}
                  />
                )}
                <div style={{ padding: "16px" }}>
                  <p style={{ fontSize: "13px", lineHeight: 1.6, marginBottom: "10px", color: "rgba(230,230,250,0.85)" }}>
                    {story.text}
                  </p>
                  <div style={{ fontSize: "11px", color: "rgba(230,230,250,0.35)", marginBottom: "14px" }}>
                    {story.location && <span>📍 {story.location} · </span>}
                    {new Date(story.created_at).toLocaleDateString("en-US", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </div>
                  <button
                    onClick={() => handleDelete(story.id)}
                    disabled={deleting === story.id}
                    style={{
                      background: "rgba(255,80,80,0.12)",
                      border: "1px solid rgba(255,80,80,0.25)",
                      borderRadius: "8px",
                      color: "rgba(255,120,120,0.8)",
                      padding: "7px 14px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontStyle: "italic",
                    }}
                  >
                    {deleting === story.id ? "deleting..." : "delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

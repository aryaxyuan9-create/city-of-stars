import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PASSWORD = "cityofstars2024";

const NYC_LOCATIONS = [
  { group: 'Manhattan', places: [
    'Central Park', 'West Village', 'SoHo', 'Lower East Side',
    'Brooklyn Bridge', 'Times Square', 'Harlem', 'Upper West Side',
    'Midtown', 'East Village', 'Chinatown', 'Financial District',
    'Roosevelt Island',
  ]},
  { group: 'Brooklyn', places: [
    'Williamsburg', 'DUMBO', 'Bushwick', 'Park Slope',
    'Coney Island', 'Crown Heights', 'Red Hook', 'Greenpoint',
  ]},
  { group: 'Queens', places: [
    'Flushing', 'Astoria', 'Long Island City', 'Jackson Heights',
  ]},
  { group: 'Bronx & Staten Island', places: [
    'The Bronx', 'Staten Island Ferry',
  ]},
];

type Story = {
  id: string;
  text: string;
  image_url?: string | null;
  location: string | null;
  taken_at: string | null;
};

export default function AdminPage() {
  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById('root')];
    els.forEach(el => { if (el) el.style.overflow = 'auto'; });
    return () => {
      els.forEach(el => { if (el) el.style.overflow = 'hidden'; });
    };
  }, []);

  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [editLocationValue, setEditLocationValue] = useState("");
  const [savingLocation, setSavingLocation] = useState<string | null>(null);

  const fetchStories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stories")
      .select("id,text,taken_at,location")
      .order("taken_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch admin stories:", error);
      setErrorMessage(error.message);
      setStories([]);
      setLoading(false);
      return;
    }
    setErrorMessage(null);
    setStories(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (authed) fetchStories();
  }, [authed]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this story?")) return;
    setDeleting(id);
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) {
      alert("Delete failed: " + error.message);
      setDeleting(null);
      return;
    }
    setStories((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  };

  const handleSaveLocation = async (id: string) => {
    setSavingLocation(id);
    const newLocation = editLocationValue || null;
    const { error } = await supabase
      .from("stories")
      .update({ location: newLocation })
      .eq("id", id);
    if (error) {
      alert("Update failed: " + error.message);
      setSavingLocation(null);
      return;
    }
    setStories((prev) =>
      prev.map((s) => s.id === id ? { ...s, location: newLocation } : s)
    );
    setSavingLocation(null);
    setEditingLocation(null);
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
      height: "100%",
      overflowY: "auto",
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

        {errorMessage && (
          <div style={{
            marginBottom: "16px",
            border: "1px solid rgba(255,150,150,0.45)",
            background: "rgba(120,0,0,0.35)",
            color: "#ffd1d1",
            borderRadius: "10px",
            padding: "10px 12px",
            fontSize: "12px",
          }}>
            Failed to load: {errorMessage}
          </div>
        )}

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
                <div style={{ padding: "16px" }}>
                  <p style={{ fontSize: "13px", lineHeight: 1.6, marginBottom: "10px", color: "rgba(230,230,250,0.85)" }}>
                    {story.text}
                  </p>

                  {/* 地点编辑区 */}
                  {editingLocation === story.id ? (
                    <div style={{ marginBottom: "14px" }}>
                      <select
                        value={editLocationValue}
                        onChange={(e) => setEditLocationValue(e.target.value)}
                        style={{
                          width: "100%",
                          background: "rgba(0,0,128,0.25)",
                          border: "1px solid rgba(230,230,250,0.2)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          color: "#E6E6FA",
                          fontSize: "12px",
                          marginBottom: "8px",
                          outline: "none",
                          fontFamily: "inherit",
                          fontStyle: "italic",
                        }}
                      >
                        <option value="">— no location —</option>
                        {NYC_LOCATIONS.map(({ group, places }) => (
                          <optgroup key={group} label={group}>
                            {places.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleSaveLocation(story.id)}
                          disabled={savingLocation === story.id}
                          style={{
                            background: "rgba(255,236,139,0.15)",
                            border: "1px solid rgba(255,236,139,0.35)",
                            borderRadius: "7px",
                            color: "#FFEC8B",
                            padding: "5px 12px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontStyle: "italic",
                          }}
                        >
                          {savingLocation === story.id ? "saving..." : "save"}
                        </button>
                        <button
                          onClick={() => setEditingLocation(null)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(230,230,250,0.15)",
                            borderRadius: "7px",
                            color: "rgba(230,230,250,0.4)",
                            padding: "5px 12px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontStyle: "italic",
                          }}
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setEditingLocation(story.id);
                        setEditLocationValue(story.location ?? "");
                      }}
                      style={{
                        fontSize: "11px",
                        color: "rgba(230,230,250,0.35)",
                        marginBottom: "14px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        borderBottom: "1px dashed rgba(230,230,250,0.15)",
                        paddingBottom: "1px",
                      }}
                      title="click to edit location"
                    >
                      {story.location ? `📍 ${story.location}` : <span style={{ color: "rgba(230,230,250,0.2)", fontStyle: "italic" }}>+ add location</span>}
                      {story.taken_at && story.location && (
                        <span style={{ marginLeft: "4px" }}>
                          · {new Date(story.taken_at).toLocaleDateString("en-US", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </span>
                      )}
                      {story.taken_at && !story.location && (
                        <span>
                          {new Date(story.taken_at).toLocaleDateString("en-US", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  )}

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

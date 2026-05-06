export default function RatingDistribution({ data }) {
  if (!data || data.length === 0) {
    return <p className="muted">No ratings yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.review_count));
  const buckets = [];
  for (let i = 0; i <= 10; i++) {
    const found = data.find((d) => d.rating_bucket === i);
    buckets.push({ rating_bucket: i, review_count: found ? found.review_count : 0 });
  }
  return (
    <div className="dist-bars">
      {buckets.map((d) => {
        const pct = max > 0 ? (d.review_count / max) * 100 : 0;
        return (
          <div className="dist-bar" key={d.rating_bucket}>
            <span>{d.rating_bucket}–{d.rating_bucket + 1}</span>
            <div className="track">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="numeric">{d.review_count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

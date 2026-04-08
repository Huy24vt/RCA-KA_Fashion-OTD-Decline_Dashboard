# KA_Fashion RCA Dashboard

Static GitHub Pages dashboard built from the synthetic logistics RCA dataset.

## Files
- `index.html`
- `styles.css`
- `script.js`
- `data/ka_fashion_shipments.json`
- `data/ka_fashion_hub_ops.json`
- `data/ka_fashion_sla.json`

## Publish on GitHub Pages
1. Create a new GitHub repo.
2. Upload all files in this folder, keeping the `data/` subfolder structure.
3. In GitHub repo settings, enable **Pages**.
4. Set source to **Deploy from a branch** and choose `main` + `/root`.
5. Open the Pages URL after deployment.

## Notes
- The dashboard is intentionally static, so it works well on GitHub Pages without a backend.
- It uses Plotly via CDN.
- Default view is the post window (`2025-08-16` to `2025-08-29`) to match the RCA story.

:root {
  --navy: #1B2A4A; --navy2: #1C3D5A; --teal: #1C5A6B; --teal2: #2E9E9E;
  --orange: #E07B1A; --paper: #F4F4EF; --panel: #fff; --ink: #22262f;
  --sub: #5b616e; --line: #d9d9d0; --line-soft: #eaeae2; --chip: #f2f2ec; --red: #A32020;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--paper); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--teal); }

.shell { max-width: 880px; margin: 0 auto; padding: 20px 14px; }
.center { max-width: 440px; margin: 40px auto 0; }

.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: 16px 18px; margin-bottom: 14px;
}
.card-h {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 13px; border-bottom: 1px solid var(--line-soft); padding-bottom: 9px;
}
.card-h h2 { margin: 0; font-size: 15px; color: var(--navy); }

.label { display: block; font-size: 12px; color: var(--sub); font-weight: 600; margin-bottom: 5px; }
.field { margin-bottom: 13px; }
.input, select.input {
  width: 100%; padding: 10px 12px; border: 1px solid var(--line);
  border-radius: 5px; font-size: 14px; color: var(--ink); background: #fff;
}
.input:focus, select.input:focus, button:focus { outline: 2px solid #2E9E9E33; }

.btn {
  padding: 10px 18px; border-radius: 5px; font-size: 14px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; text-decoration: none; display: inline-block;
}
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--navy); color: #fff; border-color: var(--navy); }
.btn-accent { background: var(--orange); color: #fff; border-color: var(--orange); }
.btn-ghost { background: #fff; color: var(--navy); border-color: var(--line); }
.btn-danger { background: #fff; color: var(--red); border-color: #e5c4c4; }
.btn-sm { padding: 6px 12px; font-size: 12.5px; }

.row { display: flex; gap: 12px; flex-wrap: wrap; }
.grow { flex: 1 1 160px; }

.chip {
  font-size: 13px; padding: 7px 13px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--line); background: #fff; color: var(--ink);
}
.chip.on { background: var(--navy); color: #fff; border-color: var(--navy); font-weight: 600; }

.band { font-size: 11px; font-weight: 700; color: #fff; border-radius: 10px; padding: 2px 9px; white-space: nowrap; }

.tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--line); background: #fff; color: var(--navy); text-decoration: none;
}
.tab.on { background: var(--navy); color: #fff; border-color: var(--navy); }

.step { font-size: 11.5px; font-weight: 600; padding: 5px 10px; border-radius: 20px; background: var(--chip); color: var(--sub); }
.step.on { background: var(--navy); color: #fff; }
.step.done { background: var(--teal); color: #fff; }

.stat { flex: 1 1 110px; min-width: 110px; background: var(--chip); border-radius: 6px; padding: 10px 12px; }
.stat b { font-size: 21px; font-weight: 800; color: var(--navy); display: block; }
.stat span { font-size: 11.5px; color: var(--sub); }

.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 8px; }
.brand { font-size: 15px; font-weight: 800; color: var(--navy); letter-spacing: .5px; }

.muted { color: var(--sub); font-size: 13px; }
.err { color: var(--red); font-size: 13px; margin-bottom: 10px; }
.ok { color: var(--teal); font-size: 13px; margin-bottom: 10px; font-weight: 600; }

.report { background: #fff; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.report-hd { background: var(--navy); color: #fff; padding: 15px 20px; }
.report-body { padding: 18px 20px; font-family: Georgia, "Times New Roman", serif; }
.report-body h1 { text-align: center; color: var(--navy); font-size: 20px; margin: 0 0 12px; }
.report-body h3 { color: var(--teal); font-size: 15px; margin: 0 0 5px; }
.report-body p, .report-body li { font-size: 13.5px; line-height: 1.65; }
table.rt { width: 100%; border-collapse: collapse; font-size: 12.5px; font-family: system-ui, sans-serif; margin-bottom: 14px; min-width: 480px; }
table.rt th { background: var(--navy2); color: #fff; border: 1px solid #d5d5cc; padding: 7px 8px; }
table.rt td { border: 1px solid #e2e2da; padding: 7px 8px; vertical-align: top; }
.scroll-x { overflow-x: auto; }

@media print { .no-print { display: none !important; } body { background: #fff; } .shell { max-width: none; } }

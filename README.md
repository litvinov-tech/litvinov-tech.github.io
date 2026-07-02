# Belo Horizonte Parking Brain

Static GitHub Pages app for daily JET rental exports.

## What it does

- Reads daily completed-rentals `.xlsx` files in the browser.
- Keeps only `Belo Horizonte`.
- Stores history in IndexedDB on the same browser.
- Ranks parking zones by starts, recent demand, net drain, peak hours, and repeatability.
- Shows when to fill each parking and how many scooters to keep ready.
- Exports/imports the learned history as JSON.
- Exports the current plan as CSV.

## Deploy on GitHub Pages

1. Create a GitHub repository, for example `bh-parking-brain`.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md`.
3. In GitHub: Settings -> Pages -> Deploy from branch -> `main` -> `/root`.
4. Open the generated Pages URL.

No backend is required. Rental files stay in the browser and are not uploaded to a server.

## Daily flow

1. Open the Pages URL.
2. Click `Загрузить аренды`.
3. Select the daily `Завершенные аренды-YYYY-MM-DD.xlsx`.
4. Use `Экспорт истории` occasionally as a backup.

## Data expected

The app expects the rental export columns used by the current JET file:

- `Город`
- `Дата начала аренды`
- `Время начала аренды`
- `Зона начала аренды`
- `Зоны завершения аренды`
- `Местоположение транспорта (начало аренды)`
- `Местоположение транспорта (конец аренды)`
- `Идентификатор`
- `ID аренды`
- `Итог`
- `Длительность`

Rows from cities other than `Belo Horizonte` are ignored.

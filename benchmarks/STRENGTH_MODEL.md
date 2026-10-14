# Strength-selection behavior audit

All 32 settings passed 10,000 seeded selection checks each (320,000 total). This verifies their configured mistake rates and permitted loss sizes on synthetic candidate pools, **not actual Elo or game strength**. Wilson intervals use z=3.2 to conservatively account for the 32 simultaneous checks.

| Target | Configured mistakes | Observed mistakes | Interval | Maximum loss (cp) | Actual Elo |
| --- | --- | --- | --- | --- | --- |
| 400 | 90.00% | 89.53% | 88.51–90.47% | 1200 | unverified |
| 500 | 87.00% | 87.00% | 85.89–88.04% | 1075 | unverified |
| 600 | 84.00% | 84.04% | 82.83–85.18% | 950 | unverified |
| 700 | 81.00% | 80.86% | 79.57–82.09% | 825 | unverified |
| 800 | 78.00% | 78.04% | 76.69–79.34% | 700 | unverified |
| 900 | 72.25% | 71.82% | 70.36–73.24% | 625 | unverified |
| 1000 | 66.50% | 67.01% | 65.49–68.50% | 550 | unverified |
| 1100 | 60.75% | 61.03% | 59.46–62.58% | 475 | unverified |
| 1200 | 55.00% | 55.19% | 53.59–56.78% | 400 | unverified |
| 1300 | 50.00% | 49.61% | 48.01–51.21% | 355 | unverified |
| 1400 | 45.00% | 44.88% | 43.29–46.48% | 310 | unverified |
| 1500 | 40.00% | 39.38% | 37.83–40.95% | 265 | unverified |
| 1600 | 35.00% | 35.45% | 33.93–36.99% | 220 | unverified |
| 1700 | 30.75% | 30.35% | 28.90–31.84% | 190 | unverified |
| 1800 | 26.50% | 26.30% | 24.92–27.73% | 160 | unverified |
| 1900 | 22.25% | 21.48% | 20.20–22.82% | 130 | unverified |
| 2000 | 18.00% | 18.11% | 16.91–19.37% | 100 | unverified |
| 2100 | 15.50% | 15.28% | 14.16–16.47% | 88 | unverified |
| 2200 | 13.00% | 12.60% | 11.58–13.70% | 75 | unverified |
| 2300 | 10.50% | 10.05% | 9.13–11.05% | 63 | unverified |
| 2400 | 8.00% | 8.53% | 7.68–9.47% | 50 | unverified |
| 2500 | 6.75% | 6.70% | 5.94–7.55% | 44 | unverified |
| 2600 | 5.50% | 5.44% | 4.76–6.21% | 38 | unverified |
| 2700 | 4.25% | 4.16% | 3.57–4.85% | 31 | unverified |
| 2800 | 3.00% | 2.91% | 2.42–3.50% | 25 | unverified |
| 2900 | 2.45% | 2.61% | 2.15–3.17% | 21 | unverified |
| 3000 | 1.90% | 1.94% | 1.55–2.43% | 17 | unverified |
| 3100 | 1.35% | 1.25% | 0.94–1.66% | 12 | unverified |
| 3200 | 0.80% | 0.71% | 0.49–1.03% | 8 | unverified |
| 3300 | 0.53% | 0.62% | 0.41–0.93% | 5 | unverified |
| 3400 | 0.27% | 0.27% | 0.15–0.49% | 3 | unverified |
| 3500 | 0.00% | 0.00% | 0.00–0.10% | 0 | unverified |

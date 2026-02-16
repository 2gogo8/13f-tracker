# 13F Tracker - S&P 500 Institutional Holdings Viewer

A Next.js 15 application for tracking institutional holdings of S&P 500 stocks using Financial Modeling Prep (FMP) API.

## Features

- **S&P 500 Dashboard**: Browse all S&P 500 constituent stocks in a responsive card grid
- **Search & Filter**: Search by ticker or company name
- **Smart Sorting**: Sort by institutional holders, price, or performance
- **Detailed Stock Views**: View top 20 institutional holders for any stock
- **Institutional Analytics**: See holder trends (increases, decreases, new positions)
- **Real-time Data**: Stock quotes and institutional holdings from FMP API
- **Dark Theme**: Beautiful dark theme with orange accents

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **API**: Financial Modeling Prep API
- **Deployment**: Vercel-ready

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- FMP API key (get one at [financialmodelingprep.com](https://financialmodelingprep.com))

### Installation

1. Clone or download this project

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your FMP API key:
```env
FMP_API_KEY=your_api_key_here
```

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Import your repository on [Vercel](https://vercel.com)

3. Add your environment variable:
   - Go to Project Settings → Environment Variables
   - Add `FMP_API_KEY` with your API key

4. Deploy!

## Project Structure

```
13f-tracker/
├── app/
│   ├── api/              # API routes (proxy for FMP)
│   │   ├── sp500/
│   │   ├── quote/
│   │   ├── institutional/
│   │   └── profile/
│   ├── stock/
│   │   └── [symbol]/     # Stock detail page
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Homepage
│   └── globals.css       # Global styles
├── components/           # React components
│   ├── StockCard.tsx
│   ├── SearchBar.tsx
│   └── SortSelect.tsx
├── types/
│   └── index.ts          # TypeScript types
├── .env.local            # Environment variables (not committed)
├── .env.example          # Environment template
└── README.md
```

## API Endpoints

All FMP API calls are proxied through Next.js API routes to keep your API key secure:

- `GET /api/sp500` - Get S&P 500 constituent list
- `GET /api/quote/[symbol]` - Get stock quote
- `GET /api/institutional/[symbol]` - Get institutional holders
- `GET /api/profile/[symbol]` - Get company profile

## Features Explained

### Homepage
- Displays all S&P 500 stocks with real-time prices
- Search functionality for quick stock lookup
- Multiple sorting options (holders, price, performance)
- Responsive grid layout (1-4 columns depending on screen size)

### Stock Detail Page
- Top 20 institutional holders with shareholdings
- Institutional summary metrics (increases, decreases, new positions)
- Quarterly change tracking
- Company profile and description
- Stock performance metrics

## License

MIT

## Author

Built with ❤️ for JG

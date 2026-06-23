'use client';
import { useEffect, useState } from 'react';

interface StockMeta {
  symbol: string;
  name: string;
  change: number;
  price?: number;
  hasChart: boolean;
}

interface AlertData {
  date: string;
  triggeredAt: string;
  ixicChange: number;
  marketLosers: StockMeta[];
  watchlistStocks: StockMeta[];
}

function StockCard({ stock, type, rank }: { stock: StockMeta; type: 'market' | 'watchlist'; rank?: number }) {
  const chartUrl = `/api/public/crash-alert/chart?symbol=${stock.symbol}&type=${type}`;
  const isDown = stock.change < 0;
  return (
    <div style={{ background:'#fff', borderRadius:'6px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden', borderTop:`3px solid ${isDown?'#ef5350':'#26a69a'}` }}>
      <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #f0ece4' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {rank && <span style={{ width:'26px',height:'26px',borderRadius:'50%',background:'#c0202a',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,flexShrink:0 }}>{rank}</span>}
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'baseline',gap:'8px' }}>
              <span style={{ fontSize:'18px',fontWeight:700,color:'#1a1a1a',fontFamily:'Georgia,serif' }}>{stock.symbol}</span>
              <span style={{ fontSize:'18px',fontWeight:700,color:isDown?'#ef5350':'#26a69a' }}>{stock.change>0?'+':''}{stock.change.toFixed(2)}%</span>
            </div>
            <div style={{ fontSize:'12px',color:'#8a8a8f',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
              {stock.name}{stock.price&&<span style={{marginLeft:'8px'}}>${stock.price.toFixed(2)}</span>}
            </div>
          </div>
        </div>
      </div>
      {stock.hasChart && <img src={chartUrl} alt={`${stock.symbol} chart`} style={{ width:'100%',display:'block' }} loading="lazy" />}
    </div>
  );
}

export default function CrashPage() {
  const [alert, setAlert] = useState<AlertData|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/crash-alert').then(r=>r.json()).then(d=>setAlert(d.alert)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const isToday = alert?.date === new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});

  return (
    <>
      <style>{`* {box-sizing:border-box;} body {margin:0;background:#f5f2ec;font-family:"Noto Sans TC",-apple-system,"PingFang TC",sans-serif;}`}</style>
      <div style={{ minHeight:'100svh',background:'#f5f2ec' }}>
        <header style={{ background:'#fff',borderBottom:'1px solid #e3ddd2',padding:'16px 20px',textAlign:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
          <a href="/insights" style={{ fontSize:'12px',color:'#8a8a8f',textDecoration:'none',display:'block',marginBottom:'8px' }}>← 返回 影子 JG</a>
          <h1 style={{ fontFamily:'"Noto Serif TC",Georgia,serif',fontSize:'26px',fontWeight:700,color:'#1a1a1a',margin:'0 0 4px' }}>⚠️ 大跌警報</h1>
          <p style={{ margin:0,fontSize:'13px',color:'#8a8a8f' }}>IXIC 盤中跌幅 ≥ 1.5% 自動觸發 · 2年日K線</p>
        </header>
        <main style={{ maxWidth:'1100px',margin:'0 auto',padding:'24px 16px' }}>
          {loading && <div style={{ textAlign:'center',padding:'4rem',color:'#8a8a8f' }}>載入中...</div>}
          {!loading && !alert && (
            <div style={{ textAlign:'center',padding:'4rem',background:'#fff',borderRadius:'8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:'48px',marginBottom:'16px' }}>📈</div>
              <div style={{ fontSize:'20px',color:'#1a1a1a',fontWeight:600 }}>今日市場平靜</div>
              <div style={{ fontSize:'14px',color:'#8a8a8f',marginTop:'8px' }}>IXIC 尚未觸發大跌警報（跌幅 &lt; 1.5%）</div>
            </div>
          )}
          {!loading && alert && (
            <>
              <div style={{ background:'#fff',borderRadius:'6px',boxShadow:'0 1px 4px rgba(0,0,0,0.08)',borderLeft:'4px solid #c0202a',padding:'20px 24px',marginBottom:'28px',display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:'13px',color:'#8a8a8f',marginBottom:'4px' }}>NASDAQ 指數</div>
                  <div style={{ fontSize:'40px',fontWeight:900,color:'#ef5350',fontFamily:'Georgia,serif',lineHeight:1 }}>{alert.ixicChange.toFixed(2)}%</div>
                </div>
                <div style={{ borderLeft:'1px solid #e3ddd2',paddingLeft:'20px' }}>
                  <div style={{ fontSize:'13px',color:'#8a8a8f',marginBottom:'4px' }}>觸發日期</div>
                  <div style={{ fontSize:'16px',fontWeight:600,color:'#1a1a1a' }}>{alert.date}</div>
                  {!isToday && <div style={{ fontSize:'12px',color:'#8a8a8f',marginTop:'2px' }}>（歷史紀錄）</div>}
                </div>
              </div>
              {alert.marketLosers.length > 0 && (
                <>
                  <h2 style={{ fontFamily:'"Noto Serif TC",Georgia,serif',fontSize:'20px',fontWeight:700,color:'#1a1a1a',margin:'0 0 16px',paddingBottom:'8px',borderBottom:'2px solid #c0202a',display:'inline-block' }}>市場跌幅前十名</h2>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(440px,1fr))',gap:'20px',marginBottom:'36px' }}>
                    {alert.marketLosers.map((s,i) => <StockCard key={s.symbol} stock={s} type="market" rank={i+1} />)}
                  </div>
                </>
              )}
              {alert.watchlistStocks.length > 0 && (
                <>
                  <h2 style={{ fontFamily:'"Noto Serif TC",Georgia,serif',fontSize:'20px',fontWeight:700,color:'#1a1a1a',margin:'0 0 16px',paddingBottom:'8px',borderBottom:'2px solid #8a8a8f',display:'inline-block' }}>自選股監測</h2>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(440px,1fr))',gap:'20px' }}>
                    {alert.watchlistStocks.map(s => <StockCard key={s.symbol} stock={s} type="watchlist" />)}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

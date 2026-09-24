import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Bug, Activity, Radio, Eye, UploadCloud, 
  Download, Film, Cpu, Terminal, ArrowRight, CheckCircle2,
  Layers, Zap, BarChart3, ChevronLeft
} from 'lucide-react';
import heroImg from './assets/aiforpestcontrol.webp';

export default function App() {
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' | 'console'
  const [detections, setDetections] = useState([]);
  const [stats, setStats] = useState({ total_pests_logged: 0, species_breakdown: [] });
  const [isConnected, setIsConnected] = useState(false);
  
  // Console state
  const [activeTab, setActiveTab] = useState('video');
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoResult, setVideoResult] = useState(null);
  const [imageResult, setImageResult] = useState(null);
  const [imagePestCount, setImagePestCount] = useState(null);
  const [consoleLog, setConsoleLog] = useState([
    'System ready. Neural weights loaded on GPU (CUDA:0).',
    'ByteTrack association module initialized.'
  ]);

  const fileInputRef = useRef(null);

  const appendLog = (msg) => {
    setConsoleLog((prev) => [...prev.slice(-6), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const fetchStats = () => {
    fetch('http://127.0.0.1:8000/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error(err));

    fetch('http://127.0.0.1:8000/api/detections?limit=15')
      .then(res => res.json())
      .then(data => setDetections(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchStats();

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/telemetry');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const incoming = JSON.parse(event.data);
      setDetections(prev => [incoming, ...prev.slice(0, 19)]);
      fetchStats();
      appendLog(`Telemetry Event: #${incoming.track_id} ${incoming.pest_type} detected`);
    };

    return () => ws.close();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    if (activeTab === 'video') {
      appendLog(`Uploading video payload: ${file.name}...`);
      setVideoResult(null);

      try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze/video', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        setVideoResult(data);
        appendLog(`Video tracking completed. ${data.unique_pests} unique pests registered.`);
        fetchStats();
      } catch (err) {
        appendLog(`Video inference failed: ${err}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      appendLog(`Evaluating crop image: ${file.name}...`);
      setImageResult(null);

      try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze/image', {
          method: 'POST',
          body: formData,
        });
        const count = res.headers.get('X-Detections-Count') || 0;
        setImagePestCount(count);
        const blob = await res.blob();
        setImageResult(URL.createObjectURL(blob));
        appendLog(`Image scan complete. ${count} insect targets localized.`);
        fetchStats();
      } catch (err) {
        appendLog(`Image inference failed: ${err}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // ==========================================
  // PAGE 1: FRONT / LANDING PAGE
  // ==========================================
  if (currentPage === 'landing') {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans selection:bg-emerald-500 selection:text-black">
        {/* Navigation Bar */}
        <nav className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Bug className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">
              AgriVision <span className="text-emerald-400 font-mono text-sm">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-300">{isConnected ? 'System Ready' : 'Broker Disconnected'}</span>
            </div>
            <button
              onClick={() => setCurrentPage('console')}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Open Console <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-mono">
              <Zap className="w-3.5 h-3.5" /> Next-Gen Autonomous Bio-Security
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Precision Pest Detection with <span className="text-emerald-400 underline decoration-emerald-500/40">Edge Vision</span>
            </h1>

            <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-2xl">
              An intelligent edge-to-cloud agricultural surveillance system integrating an optimized 
              YOLO model with ByteTrack spatio-temporal identification, real-time HiveMQ IoT telemetry, 
              and automated threat intelligence.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => setCurrentPage('console')}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3.5 rounded-xl text-sm flex items-center gap-2.5 transition shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                Launch Surveillance Console <ArrowRight className="w-4 h-4" />
              </button>
              
            </div>

            {/* Highlights Grid */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800/80 max-w-lg">
              <div>
                <div className="text-2xl font-bold font-mono text-white">52.9%</div>
                <div className="text-xs text-slate-500 mt-0.5">mAP50 Accuracy</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-emerald-400">&lt;15ms</div>
                <div className="text-xs text-slate-500 mt-0.5">RTX 3050 Latency</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-indigo-400">10 Pests</div>
                <div className="text-xs text-slate-500 mt-0.5">Field Classes</div>
              </div>
            </div>
          </div>

          {/* Hero Visual Container */}
          <div className="lg:col-span-5 relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-3xl blur-xl opacity-20"></div>
            <div className="relative rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-900 shadow-2xl">
              <img
                src={heroImg}
                alt="AI Pest Control Sentinel"
                className="w-full h-[420px] object-cover hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 border border-slate-800/90 backdrop-blur-md rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-slate-200 font-mono font-medium">Field Sentinel Node #01</span>
                </div>
                <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  ByteTrack Active
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Matrix */}
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-800/80">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl space-y-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">ByteTrack Spatial Association</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Prevents double-counting moving insects across field frames with unique Kalman-filter track persistence.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl space-y-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">HiveMQ IoT Telemetry</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Asynchronous pub/sub architecture dispatching lightweight JSON packets across distributed farm sentinels.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl space-y-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">Async SQLite Surveillance Store</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Persistent audit trail with real-time species aggregation, threat severity alerts, and one-click CSV export.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ==========================================
  // PAGE 2: COMMAND CONSOLE / DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 p-6 md:p-10 font-sans space-y-8">
      {/* Top Banner */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-800/80 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage('landing')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Return to Home"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Bug className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Agritech Surveillance Command
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  RTX 3050 CUDA
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Autonomous Pest Identification, ByteTrack Counting & Telemetry Stream
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="http://127.0.0.1:8000/api/export/csv"
            className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 transition"
          >
            <Download className="w-4 h-4 text-slate-400" />
            Export Telemetry Log
          </a>
          <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-lg text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
            <span className="font-mono text-slate-300">
              {isConnected ? 'HiveMQ Link Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider font-mono">
            <span>Total Unique Pests Logged</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-4xl font-extrabold mt-3 font-mono text-white">
            {stats.total_pests_logged}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider font-mono">
            <span>Active Camera Sentinels</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-4xl font-extrabold mt-3 font-mono text-emerald-400">
            1 Node
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider font-mono">
            <span>Threat Severity</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-4xl font-extrabold mt-3 font-mono text-amber-400">
            {stats.total_pests_logged > 15 ? 'HIGH' : 'NORMAL'}
          </div>
        </div>
      </div>

      {/* LAUNCH CONSOLE */}
      <section className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 md:p-8 backdrop-blur shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              Vision Launch Console
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Trigger deep learning inference and ByteTrack spatio-temporal tracking on uploaded media
            </p>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('video')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'video' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Video Analytics
            </button>
            <button
              onClick={() => setActiveTab('image')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'image' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Image Diagnostics
            </button>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept={activeTab === 'video' ? 'video/mp4,video/avi,video/mov' : 'image/*'}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/40 hover:bg-slate-950 p-8 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition group"
            >
              <div className="p-4 rounded-full bg-slate-900 group-hover:bg-indigo-600/10 text-slate-400 group-hover:text-indigo-400 transition mb-3">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-200">
                {isProcessing ? 'Processing Neural Model...' : `Upload ${activeTab === 'video' ? 'Field Video' : 'Crop Image'}`}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {activeTab === 'video' ? 'Supports .mp4, .mov (Full ByteTrack)' : 'Supports .jpg, .png, .jpeg'}
              </p>
            </div>

            {/* Micro Terminal Output */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-[11px] text-slate-400 space-y-1.5">
              <div className="text-slate-500 flex items-center gap-2 pb-1 border-b border-slate-900 uppercase tracking-widest text-[9px]">
                <Terminal className="w-3 h-3 text-emerald-500" /> Console Output
              </div>
              {consoleLog.map((log, i) => (
                <div key={i} className="leading-tight text-slate-300">{log}</div>
              ))}
            </div>
          </div>

          {/* Results / Screen View */}
          <div className="lg:col-span-2 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center min-h-[300px] overflow-hidden p-3">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-mono">Running model inference & spatial tracking...</span>
              </div>
            ) : activeTab === 'video' && videoResult ? (
              <div className="w-full space-y-3">
                <video src={videoResult.video_url} controls className="w-full max-h-[380px] rounded-lg bg-black" />
                <div className="flex items-center justify-between text-xs text-slate-400 px-2 font-mono">
                  <span>Unique Tracked Pests: <strong className="text-emerald-400">{videoResult.unique_pests}</strong></span>
                  <span>Species: <strong className="text-indigo-400">{videoResult.species_found.join(', ') || 'None'}</strong></span>
                </div>
              </div>
            ) : activeTab === 'image' && imageResult ? (
              <div className="w-full space-y-3 flex flex-col items-center">
                <img src={imageResult} alt="Analyzed" className="max-h-[360px] rounded-lg object-contain" />
                <div className="text-xs font-mono text-emerald-400">
                  Target Bounding Boxes Rendered: {imagePestCount}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-600 font-mono text-xs">
                Launch Console Idle. Select or drag media on the left to initiate model pipeline.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Telemetry Stream & Species Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
            <Radio className="w-4 h-4 text-emerald-400" />
            Live Ingest Stream (MQTT Telemetry)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="uppercase bg-slate-950/80 text-slate-500 border-b border-slate-800 font-mono">
                <tr>
                  <th className="px-4 py-3">Track ID</th>
                  <th className="px-4 py-3">Species</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Node</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {detections.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-600 font-sans">
                      Awaiting edge sensor packets...
                    </td>
                  </tr>
                ) : (
                  detections.map((det, index) => (
                    <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-indigo-400 font-bold">#{det.track_id}</td>
                      <td className="px-4 py-3 font-sans">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                          {det.pest_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">{det.confidence ? `${(det.confidence * 100).toFixed(1)}%` : '--'}</td>
                      <td className="px-4 py-3 text-slate-400">{det.sensor_id || 'cam_node_01'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {det.timestamp ? new Date(det.timestamp * 1000).toLocaleTimeString() : 'Just now'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-indigo-400" />
            Species Density
          </h2>
          <div className="space-y-3">
            {stats.species_breakdown.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono">No historical records.</p>
            ) : (
              stats.species_breakdown.map((item, idx) => (
                <div key={idx} className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-200 capitalize">{item.pest_type}</span>
                  <span className="bg-slate-900 text-slate-300 text-xs px-2.5 py-0.5 rounded font-mono border border-slate-800">
                    {item.count} detections
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

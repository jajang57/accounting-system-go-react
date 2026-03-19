import React, { useState, useEffect } from 'react';
import { Play, Square, ExternalLink, RefreshCw } from 'lucide-react';
import { GetStatus, StartServer, StopServer } from './wailsjs/go/main/App';
import * as runtime from './wailsjs/runtime/runtime';

function App() {
    const [status, setStatus] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const checkStatus = async () => {
        try {
            const isRunning = await GetStatus();
            setStatus(isRunning);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleStart = async () => {
        console.log("Start button clicked");
        setLoading(true);
        setMessage('');
        try {
            console.log("Calling StartServer binding...");
            const res = await StartServer();
            console.log("StartServer result:", res);
            if (res === "OK") {
                setStatus(true);
                setMessage('Server berhasil dijalankan');
            } else {
                setMessage(res);
                alert("Gagal: " + res);
            }
        } catch (e) {
            console.error("StartServer error:", e);
            setMessage("Error: " + e);
            alert("Exception: " + e);
        }
        setLoading(false);
    };

    const handleStop = async () => {
        console.log("Stop button clicked");
        setLoading(true);
        setMessage('');
        try {
            const res = await StopServer();
            console.log("StopServer result:", res);
            if (res === "OK") {
                setStatus(false);
                setMessage('Server dimatikan');
            } else {
                setMessage(res);
            }
        } catch (e) {
            console.error("StopServer error:", e);
            setMessage("Error: " + e);
        }
        setLoading(false);
    };

    const openApp = () => {
        runtime.BrowserOpenURL("http://localhost:8080");
    };

    return (
        <div className="container">
            <header>
                <h1>GL Workspace</h1>
                <div className={`badge ${status ? 'online' : 'offline'}`}>
                    {status ? 'ACTIVE' : 'INACTIVE'}
                </div>
            </header>

            <div className="content">
                <div className="controls">
                    <button
                        onClick={handleStart}
                        disabled={status || loading}
                        className="btn btn-start"
                    >
                        {loading ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
                        Start Server
                    </button>

                    <button
                        onClick={handleStop}
                        disabled={!status || loading}
                        className="btn btn-stop"
                    >
                        <Square size={18} />
                        Stop Server
                    </button>

                    <button
                        onClick={openApp}
                        disabled={!status}
                        className="btn btn-open"
                    >
                        <ExternalLink size={18} />
                        Open App
                    </button>
                </div>

                {message && <div className="message">{message}</div>}
            </div>

            <footer>
                <p>Port: 8080 | Status: {status ? 'Running' : 'Stopped'}</p>
            </footer>
        </div>
    );
}

export default App;

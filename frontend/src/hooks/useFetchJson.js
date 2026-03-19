import { useState, useEffect } from 'react';

export function useFetchJson(url) {
    const [state, setState] = useState({ loading: true, error: "", data: null });
    useEffect(() => {
        if (!url) {
            setState({ loading: false, error: "", data: null });
            return;
        }
        let alive = true;
        // Keep previous data while refetching to avoid table flicker/blank.
        setState(prev => ({ loading: true, error: "", data: prev.data }));
        fetch(url)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(d => alive && setState({ loading: false, error: "", data: d }))
            .catch(e => alive && setState({ loading: false, error: e.message || "failed", data: null }));
        return () => { alive = false; };
    }, [url]);
    return state;
}

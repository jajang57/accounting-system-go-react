export async function fetchJson(url) {
    if (!url) {
        return null;
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
}

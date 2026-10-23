package com.agtech.animalwelfare;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintDocumentAdapter;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"file".equals(uri.getScheme());
            }
        });
        webView.addJavascriptInterface(new AppBridge(this), "AgTech");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private class AppBridge {
        private final Context context;
        AppBridge(Context context) { this.context = context; }

        @JavascriptInterface public void postJson(String json, String callbackId) {
            executor.execute(() -> {
                String response;
                try {
                    JSONObject payload = new JSONObject(json);
                    String endpoint = payload.optString("endpoint", "");
                    payload.remove("endpoint");
                    if (endpoint.isEmpty() || endpoint.contains("__APPS_SCRIPT_URL__")) {
                        response = new JSONObject().put("ok", false).put("error", "Backend URL is not configured. See README.md.").toString();
                    } else {
                        URL url = new URL(endpoint);
                        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                        connection.setRequestMethod("POST");
                        connection.setConnectTimeout(15000);
                        connection.setReadTimeout(20000);
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                        byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                        try (OutputStream os = connection.getOutputStream()) { os.write(bytes); }
                        int code = connection.getResponseCode();
                        InputStream stream = (code >= 200 && code < 400) ? connection.getInputStream() : connection.getErrorStream();
                        StringBuilder sb = new StringBuilder();
                        if (stream != null) try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) { String line; while ((line = br.readLine()) != null) sb.append(line); }
                        response = sb.length() == 0 ? new JSONObject().put("ok", false).put("error", "Empty backend response (HTTP " + code + ")").toString() : sb.toString();
                        connection.disconnect();
                    }
                } catch (Exception ex) {
                    try { response = new JSONObject().put("ok", false).put("error", "Network/backend error: " + ex.getMessage()).toString(); }
                    catch (Exception ignored) { response = "{\"ok\":false,\"error\":\"Network/backend error\"}"; }
                }
                final String result = response;
                mainHandler.post(() -> webView.evaluateJavascript("window.nativeResponse(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(result) + ")", null));
            });
        }

        @JavascriptInterface public void printPage(String title) {
            mainHandler.post(() -> {
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title == null ? "Animal Welfare Document" : title);
                printManager.print(title == null ? "Animal Welfare Document" : title, adapter, new PrintAttributes.Builder().build());
            });
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() { executor.shutdown(); if (webView != null) webView.destroy(); super.onDestroy(); }
}

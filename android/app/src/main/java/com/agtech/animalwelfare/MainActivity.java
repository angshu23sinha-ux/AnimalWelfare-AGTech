package com.agtech.animalwelfare;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.IOException;
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
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().getDecorView().setBackgroundColor(Color.rgb(245, 248, 245));
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(Color.rgb(20, 83, 45));
            getWindow().setNavigationBarColor(Color.rgb(245, 248, 245));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 248, 245));
        webView.setVerticalScrollBarEnabled(false);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setTextZoom(100);
        // Keep the HTML viewport at the device width; disable pinch-zoom controls.
        webView.getSettings().setUseWideViewPort(true);
        webView.getSettings().setLoadWithOverviewMode(false);
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"file".equals(uri.getScheme());
            }
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        } else {
            webView.setFitsSystemWindows(true);
        }
        webView.addJavascriptInterface(new AppBridge(this), "AgTech");
        setContentView(webView);
        webView.requestApplyInsets();
        webView.loadUrl("file:///android_asset/index.html");
    }

    private class AppBridge {
        @SuppressWarnings("unused")
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
                        response = postWithAppsScriptRedirects(endpoint, payload);
                    }
                } catch (Exception ex) {
                    try {
                        response = new JSONObject().put("ok", false).put("error", "Network/backend error: " + ex.getMessage()).toString();
                    } catch (Exception ignored) {
                        response = "{\"ok\":false,\"error\":\"Network/backend error\"}";
                    }
                }
                final String result = response;
                mainHandler.post(() -> {
                    if (webView != null && !isFinishing()) {
                        webView.evaluateJavascript("window.nativeResponse(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(result) + ")", null);
                    }
                });
            });
        }

        @JavascriptInterface public void printPage(String title) {
            mainHandler.post(() -> {
                if (webView == null || isFinishing()) return;
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title == null ? "Animal Welfare Document" : title);
                printManager.print(title == null ? "Animal Welfare Document" : title, adapter, new PrintAttributes.Builder().build());
            });
        }
    }

    /* Apps Script ContentService may redirect POST responses to a temporary
       script.googleusercontent.com URL. Follow that redirect explicitly. */
    private String postWithAppsScriptRedirects(String endpoint, JSONObject payload) throws Exception {
        URL currentUrl = new URL(endpoint);
        String method = "POST";
        byte[] requestBody = payload.toString().getBytes(StandardCharsets.UTF_8);

        for (int redirectCount = 0; redirectCount <= 5; redirectCount++) {
            HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(45000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "Sporsho-Android/0.1");
            if ("POST".equals(method)) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(requestBody.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(requestBody); }
            }

            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IOException("Backend redirect did not include a Location header (HTTP " + status + ").");
                }
                if (redirectCount == 5) throw new IOException("Too many backend redirects.");
                URL nextUrl = new URL(currentUrl, location);
                if (!"https".equalsIgnoreCase(nextUrl.getProtocol())) throw new IOException("Refusing an insecure backend redirect.");
                if (status == HttpURLConnection.HTTP_SEE_OTHER ||
                    ((status == HttpURLConnection.HTTP_MOVED_PERM || status == HttpURLConnection.HTTP_MOVED_TEMP) && "POST".equals(method))) {
                    method = "GET";
                }
                currentUrl = nextUrl;
                continue;
            }

            InputStream stream;
            try { stream = (status >= 200 && status < 400) ? connection.getInputStream() : connection.getErrorStream(); }
            catch (IOException e) { stream = connection.getErrorStream(); }
            StringBuilder body = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
            }
            connection.disconnect();
            String result = body.toString().trim();
            if (status < 200 || status >= 400) {
                try { new JSONObject(result); return result; }
                catch (Exception notJson) {
                    String detail = result.length() > 180 ? result.substring(0, 180) : result;
                    return new JSONObject().put("ok", false).put("error", "Backend returned HTTP " + status + (detail.isEmpty() ? "." : ": " + detail)).toString();
                }
            }
            if (result.isEmpty()) return new JSONObject().put("ok", false).put("error", "Empty backend response (HTTP " + status + ").").toString();
            return result;
        }
        throw new IOException("Backend redirect limit exceeded.");
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        executor.shutdown();
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}

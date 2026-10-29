#import "LegacyViewController.h"

@implementation LegacyViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:6.0/255.0 green:16.0/255.0 blue:26.0/255.0 alpha:1.0];
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:configuration];
    self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.webView.navigationDelegate = self;
    self.webView.backgroundColor = self.view.backgroundColor;
    self.webView.opaque = NO;
    [self.view addSubview:self.webView];
    NSString *htmlPath = [[NSBundle mainBundle] pathForResource:@"index" ofType:@"html"];
    NSString *resourcePath = [[NSBundle mainBundle] resourcePath];
    if (htmlPath && resourcePath) {
        NSURL *htmlURL = [NSURL fileURLWithPath:htmlPath];
        NSURL *readURL = [NSURL fileURLWithPath:resourcePath isDirectory:YES];
        [self.webView loadFileURL:htmlURL allowingReadAccessToURL:readURL];
    } else {
        [self showFallback];
    }
}

- (void)showFallback {
    NSString *html = @"<!doctype html><html><body style='background:#06101a;color:#fff;font:18px -apple-system;padding:25px'>MirrorForge legacy launcher resources are missing. Reinstall the app.</body></html>";
    [self.webView loadHTMLString:html baseURL:nil];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"MirrorForge legacy navigation failed: %@", error.localizedDescription);
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    NSLog(@"MirrorForge legacy connection failed: %@", error.localizedDescription);
}

- (UIInterfaceOrientationMask)supportedInterfaceOrientations {
    return UIInterfaceOrientationMaskAll;
}

- (BOOL)shouldAutorotate {
    return YES;
}

@end

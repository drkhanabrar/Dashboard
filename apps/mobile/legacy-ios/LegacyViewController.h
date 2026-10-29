#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

@interface LegacyViewController : UIViewController <WKNavigationDelegate>
@property (strong, nonatomic) WKWebView *webView;
@end

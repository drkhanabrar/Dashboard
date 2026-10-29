#import "AppDelegate.h"
#import "LegacyViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
    LegacyViewController *controller = [[LegacyViewController alloc] init];
    self.window.rootViewController = controller;
    [self.window makeKeyAndVisible];
    return YES;
}

@end

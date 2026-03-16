export interface TomcatServer {
  id: string;
  name: string;
  tomcatHome: string;
  jdkHome: string;
  startupScript?: string;
  shutdownScript?: string;
  defaultCatalinaOpts?: string;
  defaultJavaOpts?: string;
}

export interface TomcatServersConfig {
  servers: TomcatServer[];
}

export interface ResolvedConfig {
  server: TomcatServer;
  catalinaOpts: string;
  javaOpts: string;
}

export interface TomcatLaunchConfig {
  type: 'tomcat';
  request: 'launch';
  name: string;
  serverId?: string;
  jpda?: boolean;
  jpdaPort?: number;
  jpdaSuspend?: boolean;
  attachJavaDebugger?: boolean;
  attachDelay?: number;
  catalinaOpts?: string;
  javaOpts?: string;
}

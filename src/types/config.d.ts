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

export interface ProjectConfig {
  serverId: string;
  catalinaOpts?: string;
  javaOpts?: string;
}

export interface TomcatServersConfig {
  servers: TomcatServer[];
  projects: Record<string, ProjectConfig>;
}

export interface ResolvedConfig {
  server: TomcatServer;
  catalinaOpts: string;
  javaOpts: string;
}

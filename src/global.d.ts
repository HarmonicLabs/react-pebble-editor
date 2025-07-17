interface Window {
    require: {
      (modules: string[], callback: (...args: any[]) => void): void;
      config: (options: { paths: { [key: string]: string } }) => void;
    };
  }
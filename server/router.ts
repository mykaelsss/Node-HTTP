const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = typeof METHODS[number];

export const isMethod = (m: string): m is Method => METHODS.includes(m as Method);


type Response = {
    send: (body: string) => void,
    json: (data: unknown) => void,
    status: (code: number) => Response
}

type Request = {
    method: Method,
    path: string,
    headers: Record<string, string>,
    body: unknown,
    params: Record<string, string>
}

type Handler = (req: Request, res: Response) => void

type Route = {
    regex: RegExp,
    paramNames: string[],
    handler: Handler
}

const routes: Record<Method, Route[]> = {
    GET: [],
    POST: [],
    PUT: [],
    PATCH: [],
    DELETE: []
};

const pathToRegex = (path: string): { regex: RegExp; paramNames: string[] } => {
    const paramNames: string[] = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
    });
    return { regex: new RegExp(`^${pattern}$`), paramNames };
};

const register = (method: Method, path: string, handler: Handler) => {
    const { regex, paramNames } = pathToRegex(path);
    routes[method].push({ regex, paramNames, handler });
};

export const match = (method: Method, path: string): { handler: Handler; params: Record<string, string> } | null => {
    for (const route of routes[method]) {
        const result = route.regex.exec(path);
        if (result) {
            const params: Record<string, string> = {};
            route.paramNames.forEach((name, i) => {
                params[name] = result[i + 1];
            });
            return { handler: route.handler, params };
        }
    }
    return null;
};

export const router = {
    get: (path: string, handler: Handler) => register('GET', path, handler),
    post: (path: string, handler: Handler) => register('POST', path, handler),
    put: (path: string, handler: Handler) => register('PUT', path, handler),
    patch: (path: string, handler: Handler) => register('PATCH', path, handler),
    delete: (path: string, handler: Handler) => register('DELETE', path, handler),
};

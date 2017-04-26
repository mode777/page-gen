import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";
import * as marked from "marked";


interface Config {
    $dir: string,
    $pages: Page[],
    $layouts: {[key: string]: Layout}
    $date: Date
}

interface Layout {
    $layout?: string;
    $src: string;
    $template?: template; 
}

interface Page {
    $out?: string;
    $src: string;
    $layout?: string;
    [key: string]: any;
}

export class ConfigurationLoader {

    private _config: Config;
    
    constructor(private _contentDir: string, private _configFile: string){
        
    }

    load(){
        this._loadConfig();
        this._loadLayouts();
    }

    private _loadConfig(){
        this._config = <Config>JSON.parse(fs.readFileSync(path.join(this._contentDir, this._configFile), "utf8"))
        this._config.$date = new Date();
    }

    private _loadTemplate(path: string): template{
        const srcTemplate = fs.readFileSync(path, "utf-8");
        return doT.template(srcTemplate);
    }

    private _loadLayouts(){
        for (var key in this._config.$layouts) {
            const layout = this._config.$layouts[key];
            const layoutPath = path.join(this._contentDir, layout.$src);
            layout.$template = this._loadTemplate(layoutPath);
        }
    }

}
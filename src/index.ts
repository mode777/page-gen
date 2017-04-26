import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";
import * as marked from "marked";

doT.templateSettings.strip = false;

let data = { anchor: "a" }
let templ = doT.template(`
{{## 
    def.inject = "injected value"
#}}
<h1>{{=it.inject}}</h1>
`, null, data);

let html = templ(data);



type template = (data: any) => string;

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

function loadTemplate(path: string): template{
    const srcTemplate = fs.readFileSync(path, "utf-8");
    return doT.template(srcTemplate);
}

try {

    const contentDir = path.join(process.cwd(), process.argv[2] || ".");
    const configFile = process.argv[3] || "pages.json";

    const config = <Config>JSON.parse(fs.readFileSync(path.join(contentDir, configFile), "utf8"))
    config.$date = new Date();

    for (var key in config.$layouts) {
        const layout = config.$layouts[key];
        const layoutPath = path.join(contentDir, layout.$src);
        layout.$template = loadTemplate(layoutPath);
    }

    function renderLayout(layoutName: string, data: any){
        const layout = config.$layouts[layoutName];
        data["$content"] = layout.$template(data);
     
        if(layout.$layout)
            return renderLayout(layout.$layout, data);
        else
            return data["$content"];
    }
    
    const outDir = path.join(contentDir, config.$dir || "out");
    if(!fs.existsSync(outDir)){
        fs.mkdirSync(outDir);
    }

    for(let page of config.$pages || []){
        
        let content: string;
        let pageData = {
            $page: page,
            $site: config
        };
        
        const filePath = path.join(contentDir, page.$src);
        const ext = path.extname(filePath);

        let pageContent = loadTemplate(filePath)(pageData);

        if(ext.toUpperCase() == ".MD")
            pageContent = marked.parse(pageContent);

        if(page.$layout){
            pageData["$content"] = pageContent;
            const layoutContent = renderLayout(page.$layout, pageData); 
            content = layoutContent;
        }
        else
            content = pageContent;

        const outPath = path.join(outDir, page.$out || page.$src);
        fs.writeFileSync(outPath, content);
    }
    
    console.log("All done!");
}
catch(e){
    console.log("Generation failed");
    console.log(e);
}
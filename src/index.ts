import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";

interface Config {
    $dir: string,
    $pages: Page[],
    $date: Date
}

interface Page {
    $out?: string;
    $src: string;
    $layout?: string;
    [key: string]: any;
}

const contentDir = path.join(process.cwd(), process.argv[2] || ".");
const configFile = process.argv[3] || "pages.json";

try {
    const config = <Config>JSON.parse(fs.readFileSync(path.join(contentDir, configFile), "utf8"))
    config.$date = new Date();
    
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
        const srcTemplate = fs.readFileSync(filePath, "utf-8");
        let pageContent = doT.template(srcTemplate)(pageData);
        


        if(page.$layout){
            const layoutPath = path.join(contentDir, page.$layout);
            const layoutTemplate = fs.readFileSync(layoutPath, "utf-8");
            pageData["$content"] = pageContent;
            const layoutContent = doT.template(layoutTemplate)(pageData);
            content = layoutContent
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


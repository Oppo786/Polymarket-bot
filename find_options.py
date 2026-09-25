path = 'node_modules/@polymarket/clob-client/dist/client.d.ts'
with open(path) as f:
    text = f.read()

idx = text.find('CreateOrderOptions')
if idx != -1:
    print(text[idx-50:idx+400])
else:
    # search all files for CreateOrderOptions
    import os
    for root, dirs, files in os.walk('node_modules/@polymarket/clob-client/dist'):
        for file in files:
            if file.endswith('.d.ts'):
                p = os.path.join(root, file)
                with open(p) as tf:
                    t = tf.read()
                    if 'CreateOrderOptions' in t:
                        print("Found in", p, ":\n", t[t.find('CreateOrderOptions'):t.find('CreateOrderOptions')+300])

import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";

const AdminDebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState<Record<string, any>>({});

  const checkOrdersSchema = async () => {
    try {
      // Try to get column info via a single row
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .limit(1);

      if (error) {
        toast.error(`Schema check error: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        toast.info("No orders found to check schema");
        return;
      }

      // Extract available columns from the first order
      const columns = Object.keys(data[0]);

      setSchemaInfo({
        columns,
        sample: data[0],
      });

      toast.success(`Found ${columns.length} columns in orders table`);
    } catch (e) {
      toast.error(`Failed to check schema: ${e.message}`);
    }
  };

  return (
    <div className="my-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded"
      >
        {isOpen ? "Hide Debug" : "Debug Tools"}
      </button>

      {isOpen && (
        <div className="mt-3 p-4 bg-gray-800 rounded text-white text-xs">
          <h4 className="font-bold mb-2">Admin Debug Tools</h4>

          <div className="space-y-2">
            <button
              onClick={checkOrdersSchema}
              className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-white"
            >
              Check Orders Schema
            </button>

            {Object.keys(schemaInfo).length > 0 && (
              <div className="mt-3">
                <h5 className="font-bold">Schema Info:</h5>
                <div className="mt-1 overflow-x-auto">
                  <pre className="text-xs bg-gray-900 p-2 rounded">
                    {JSON.stringify(schemaInfo, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDebugPanel;
